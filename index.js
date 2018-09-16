/*** LGWebOSTV Z-Way HA module *******************************************
 Version: 1.0.0

 -----------------------------------------------------------------------------
 Author: Mattias Forss
 Description:
     This module controls LG WebOS Smart TVs.

******************************************************************************/

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function LGWebOSTV(id, controller) {
    // Call superconstructor first (AutomationModule)
    LGWebOSTV.super_.call(this, id, controller);
};

inherits(LGWebOSTV, AutomationModule);

_module = LGWebOSTV;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

LGWebOSTV.prototype.init = function(config) {
    LGWebOSTV.super_.prototype.init.call(this, config);
    var self = this,
        device = {},
        configuration = {},
        connected = false,
        checkCount = 0,
        tvMuted = false,
        tvVolume = 0;

    executeFile(this.moduleBasePath() + "/wakeonlan.js");
    executeFile(this.moduleBasePath() + "/lgtv.js");
    this.wakeonlan = new WakeOnLan();
    this.tv = new LGTV({
        ip: config.device.ip,
        clientKey: config.configuration.clientKey,
        location: getModuleLocation()
    });

    /* Server-side config not directly coupled to UI config, which makes it easier to adapt to changes */
    config.configuration = config.configuration || {};
    config.configuration.knownApps = config.configuration.knownApps || [];
    config.configuration.apps = config.configuration.apps || [];
    device.ip = config.device.ip;
    device.mac = config.device.mac;
    device.url = "ws://" + config.device.ip + ":3000";
    configuration.timeout = config.configuration.timeout || 15000;
    configuration.reconnect = typeof config.configuration.reconnect === "undefined" ? 5000 : config.configuration.reconnect;
    configuration.pollingEnabled = config.configuration.pollingEnabled || true;
    configuration.alivePollingInterval = config.configuration.alivePollingInterval || 5;
    configuration.alivePollingInterval = configuration.alivePollingInterval * 1000;
    configuration.clientKey = config.configuration.clientKey;
    configuration.volumeLimit = 100;
    configuration.knownApps = config.configuration.knownApps || [];
    configuration.apps = config.configuration.apps || [];

    this.appVdevs = [];
    this.checkAliveInterval = undefined;

    this.powerHandler = function(command, arguments) {
        console.log("[LGWebOSTV] Power handler received command: " + command + ", arguments: " + JSON.stringify(arguments));
        if (command === "update") {
            if (arguments && (arguments === "on" || arguments === "off")) {
                console.log("[LGWebOSTV] Power state updated to: " + arguments);
                self.powerVdev.set("metrics:level", arguments);
            }
        } else {
            self.setPowerState(command, function(error) {
                if (error) {
                    console.log("[LGWebOSTV] Failed to set power state: " + error);
                } else {
                    console.log("[LGWebOSTV] Power state set to: " + command);
                    self.powerVdev.set("metrics:level", command);
                }
            });
        }
    };

    this.volumeHandler = function(command, arguments) {
        console.log("[LGWebOSTV] Volume handler received command: " + command + ", arguments: " + JSON.stringify(arguments));
        if (command === "update" && arguments) {
            if (arguments.level) {
                console.log("[LGWebOSTV] Volume state updated to: " + arguments.level);
                self.volumeVdev.set("metrics:level", arguments.level);
            } else if (arguments === "off") {
                console.log("[LGWebOSTV] Volume state updated to: 0");
                self.volumeVdev.set("metrics:level", 0);
            } else if (arguments !== "on" && arguments !== "off") {
                self.setMuteState(tvMuted, function(error) {
                    if (error) {
                        console.log("[LGWebOSTV] Failed to set mute state: " + error);
                    } else {
                        console.log("[LGWebOSTV] Mute state set to: " + (tvMuted === true ? "Off" : "On"));
                        self.volumeVdev.set("metrics:level", (tvMuted === true ? tvVolume : "off"));
                    }
                });
            }
        } else if (command === "exact" && arguments && arguments.level) {
            var level = parseInt(arguments.level, 10);
            console.log("[LGWebOSTV] Setting volume state to level: " + level);
            self.setVolumeState(level, function(error) {
                if (error) {
                    console.log("[LGWebOSTV] Failed to set volume state: " + error);
                } else {
                    console.log("[LGWebOSTV] Volume state set to: " + level);
                    self.volumeVdev.set("metrics:level", level);
                }
            });
        }
    };

    this.appHandler = function(devId, appId, command, arguments) {
        console.log("[LGWebOSTV] App handler received command: " + command + ", arguments: " + JSON.stringify(arguments));
        if (command === "update") {
            if (arguments && (arguments === "on" || arguments === "off")) {
                console.log("[LGWebOSTV] App state for app with id '" + appId + "' updated to: " + arguments);
                self.controller.devices.get(devId).set("metrics:level", arguments);
            }
        } else {
            self.setAppState(command === "on", function(error) {
                if (error) {
                    console.log("[LGWebOSTV] Failed to set app state for app with id '" + appId + "', error: " + error);
                } else {
                    console.log("[LGWebOSTV] App state for app with id '" + appId + "' set to: " + command);
                    self.controller.devices.get(devId).set("metrics:level", command);
                }
            }, appId);
        }
    };

    this.controller.devices.remove("LGWebOSTV_Power_" + this.id);
    this.controller.devices.remove("LGWebOSTV_Volume_" + this.id);
    // Create vDevs
    this.powerVdev = this.controller.devices.create({
        deviceId: "LGWebOSTV_Power_" + this.id,
        defaults: {
            deviceType: "switchBinary",
            metrics: {
                title: self.getInstanceTitle() + " Power",
                icon: "switch",
                level: "off"
            }
        },
        overlay: {},
        handler: self.powerHandler,
        moduleId: this.id
    });
    this.volumeVdev = this.controller.devices.create({
        deviceId: "LGWebOSTV_Volume_" + this.id,
        defaults: {
            deviceType: "switchMultilevel",
            metrics: {
                title: self.getInstanceTitle() + " Volume",
                icon: "multilevel",
                level: 0
            }
        },
        overlay: {},
        handler: self.volumeHandler,
        moduleId: this.id
    });


    configuration.apps.forEach(function(appId) {
        self.controller.devices.remove("LGWebOSTV_App_" + appId + "_" + self.id);
        var app = configuration.knownApps.filter(function(knownApp) {
            return knownApp.appId === appId;
        });
        if (app.length > 0) {
            var devId = "LGWebOSTV_App_" + app[0].appId + "_" + self.id;
            self.appVdevs.push(self.controller.devices.create({
                deviceId: devId,
                defaults: {
                    deviceType: "switchBinary",
                    metrics: {
                        title: self.getInstanceTitle() + " " + app[0].title,
                        icon: "switch",
                        level: "off"
                    }
                },
                overlay: {},
                handler: function(command, arguments) {
                    self.appHandler.call(self, devId, app[0].appId, command, arguments);
                },
                moduleId: self.id
            }));
        }
    });

    this.saveKey = function(key, cb) {
        try {
            configuration.clientKey = key;
            self.config.configuration.clientKey = key;
            self.saveConfig();
            cb();
        } catch (err) {
            cb(err);
        }
    };

    function getModuleLocation() {
        return self.controller.getModuleData(self.constructor.name).location;
    }

    this.onWebOSConnect = function(clientKey) {
        console.log("[LGWebOSTV] WebOS - connected to TV.");
        self.saveKey(clientKey, function(err) {
            if (err) {
                console.log("[LGWebOSTV] Failed to save WebOS client key, error: " + err);
            }
        });

        if (connected == true) {
            return;
        }

        connected = true;
        self.powerVdev.performCommand("update", "on");
        if (!self.checkAliveInterval && configuration.pollingEnabled) {
            self.checkAliveInterval = setInterval(self.checkTVState.bind(self, self.pollCallback), configuration.alivePollingInterval);
        }
        console.log("[LGWebOSTV] WebOS - subscribing to TV services");
        self.tv.subscribeToForegroundAppInfo(function(err, res) {
            if (!res || err) {
                console.log("[LGWebOSTV] WebOS - TV app check - error while getting current app: " + err);
            } else {
                if (res.appId) {
                    console.log("[LGWebOSTV] WebOS - app launched, current appId: " + res.appId);

                    self.tv.getAppInfo(res.appId, function(err2, res2) {
                        if (!res2 || !res2.returnValue || !res2.appInfo || err2) {
                            console.log("[LGWebOSTV] WebOS - TV app check - error while getting current app info: " + err2);
                        } else {
                            console.log("[LGWebOSTV] WebOS - app title of current app is '", res2.appInfo.title + "'.");
                            var knownApps = configuration.knownApps.filter(function(app) {
                                return app.appId === res2.appId;
                            });

                            if (knownApps.length === 0) {
                                var app = {
                                    appId: res2.appId,
                                    title: res2.appInfo.title
                                };
                                configuration.knownApps.push(app);
                                self.config.configuration.knownApps = configuration.knownApps;
                                self.saveConfig();
                            }
                        }
                    });
                }
            }
        });
        self.tv.subscribeToAudio(function(err, res) {
            if (!res || err) {
                console.log("[LGWebOSTV] WebOS - TV audio status - error while getting current audio status: " + err);
            } else {
                console.log("[LGWebOSTV] WebOS - audio status changed.");

                // volume state
                tvVolume = res.volume;
                self.setVolumeStateManually(null, tvVolume);
                console.log("[LGWebOSTV] WebOS - current volume: " + res.volume);

                // mute state
                tvMuted = res.mute;
                self.setMuteStateManually(null, tvMuted);
                console.log("[LGWebOSTV] WebOS - muted: " + (res.mute ? "Yes" : "No"));
            }
        });

        self.updateAccessoryStatus();
    };

    this.onWebOSConnecting = function(host) {
        console.log("[LGWebOSTV] WebOS - connecting to TV on host: " + host);
        connected = false;
    };

    this.onWebOSError = function(error) {
        if (error) {
            console.log("[LGWebOSTV] WebOS error: " + error);
        } else {
            console.log("[LGWebOSTV] WebOS - unknown error occurred.")
        }
    };

    this.onWebOSClose = function() {
        console.log("[LGWebOSTV] WebOS - disconnected from TV.");
        connected = false;
    };

    this.onWebOSPrompt = function() {
        console.log("[LGWebOSTV] WebOS - please confirm connection permission on your TV!");
        connected = false;
    };

    this.tv.on("connect", this.onWebOSConnect);
    this.tv.on("error", this.onWebOSError);
    this.tv.on("close", this.onWebOSClose);
    this.tv.on("prompt", this.onWebOSPrompt);
    this.tv.on("connecting", this.onWebOSConnecting);

    this.updateAccessoryStatus = function() {
        configuration.apps.forEach(function(appId) {
            self.checkForegroundApp(self.setAppStateManually, appId);
        });
    };

    this.checkForegroundApp = function(callback, appId) {
        if (connected) {
            self.tv.getForegroundAppInfo(function(err, res) {
                if (!res || err) {
                    callback(new Error("WebOS - current app - error while getting current app info"));
                } else {
                    console.log("[LGWebOSTV] WebOS - TV current app id '" + res.appId + "'");
                    if (appId == undefined || appId == null) {
                        callback(null, true, res.appId);
                    } else if (res.appId === appId) {
                        callback(null, true, appId);
                    }
                }
            });
        } else {
            callback(null, false);
        }
    };

    this.checkTVState = function(callback) {
        var ping = function(callback) {
            var socket = new sockets.tcp(),
                state,
                closedManually = false;

            socket.onconnect = function() {
                connected = true;
                state = (connected ? "on" : "off");
                closedManually = true;
                this.close();
                callback(null, state);
            };
            socket.onclose = function() {
                if (!closedManually) {
                    connected = false;
                    state = (connected ? "on" : "off");
                    callback(null, state);
                }
            };
            var result = socket.connect(device.ip, 3000);
            if (result === false) {
                connected = false;
                state = (connected ? "on" : "off");
                callback(null, state);
            }
        }

        ping(callback);
    };

    this.checkConnection = function(callback) {
        if (connected) {
            checkCount = 0;
            self.tv.connect(device.url);
            callback(null, true);
        } else {
            if (checkCount < 3) {
                checkCount++;
                self.tv.connect(device.url);
                setTimeout(self.checkConnection.bind(self, callback), 5000);
            } else {
                checkCount = 0;
                callback(new Error("WebOS - connection timeout"));
            }
        }
    };

    this.setPowerState = function(state, callback) {
        if (state && state === "on") {
            if (!connected) {
                self.wakeonlan.wake(device.mac, function(error) {
                    if (error) {
                        return callback(new Error("WebOS - wake on lan error"));
                    }
                    checkCount = 0;
                    setTimeout(self.checkConnection.bind(self, callback), 5000);
                });
            } else {
                callback();
            }
        } else {
            if (connected) {
                self.tv.turnOff(function(err, res) {
                    if (err) {
                        return callback(new Error("WebOS - error turning off the TV"));
                    }
                    self.tv.disconnect();
                    connected = false;
                    self.setAppStateManually(null, false, null);
                    self.setMuteStateManually(null, true);
                    callback();
                });
            } else {
                callback();
            }
        }
    };

    this.setVolumeState = function(level, callback) {
        if (connected) {
            if (level > configuration.volumeLimit) {
                level = configuration.volumeLimit;
            }
            self.tv.setVolume(level);
            callback();
        } else {
            callback(new Error("WebOS - is not connected, cannot set volume"));
        }
    };

    this.setVolumeStateManually = function(error, value) {
        if (self.volumeVdev) {
            self.volumeVdev.performCommand("update", {
                level: value
            });
        }
    };

    this.setMuteState = function(state, callback) {
        if (connected) {
            self.tv.setMute(!state);
            callback();
        } else {
            callback(new Error("WebOS - is not connected, cannot set mute state"));
        }
    };

    this.setMuteStateManually = function(error, value) {
        if (!error && self.volumeVdev) {
            self.volumeVdev.performCommand("update", (value === true ? "off" : "on"));
        }
    };

    this.setAppState = function(state, callback, appId) {
        if (connected) {
            if (state) {
                self.tv.launchApp(appId);
                this.setAppStateManually(null, true, appId);
            } else {
                self.tv.launchApp("com.webos.app.livetv");
            }
            callback();
        } else {
            if (state) {
                console.log("[LGWebOSTV] WebOS - Trying to launch app with id '" + appId + "'' but TV is off, attempting to power on the TV");
                self.powerOnTvWithCallback(function() {
                    console.log("[LGWebOSTV] WebOS - Connected to TV, launching app with id '" + appId + "'.");
                    self.tv.launchApp(appId);
                    self.setAppStateManually(null, true, appId);
                });
            } else {
                callback();
            }
        }
    };

    this.setAppStateManually = function(error, value, appId) {
        if (!error && self.appVdevs.length > 0) {
            if (appId == undefined || appId == null || appId.length <= 0) {
                self.appVdevs.forEach(function(appVdev, i) {
                    appVdev.performCommand("update", (value === true ? "on" : "off"));
                });
            } else {
                self.appVdevs.forEach(function(appVdev, i) {
                    if (appVdev.id.indexOf(appId) > -1) {
                        appVdev.performCommand("update", (value === true ? "on" : "off"));
                    } else {
                        appVdev.performCommand("update", "off");
                    }
                });
            }
        }
    };

    self.powerOnTvWithCallback = function(callback) {
        self.wakeonlan.wake(device.mac, function(error) {
            if (error) {
                console.log("[LGWebOSTV] WebOS - wake on lan error");
                return;
            }
            var x = 0;
            var appLaunchInterval = setInterval(function() {
                if (connected) {
                    setTimeout(callback.bind(this), 1000);
                    clearInterval(appLaunchInterval);
                    return;
                }

                self.tv.connect(device.url);

                if (x++ === 7) {
                    clearInterval(appLaunchInterval);
                    return;
                }
            }, 3000);
        });
    };


    this.pollCallback = function(error, status) {
        if (status === "off") {
            if (self.volumeVdev) {
                self.volumeVdev.performCommand("update", status);
            }

            if (self.checkAliveInterval) {
                clearInterval(self.checkAliveInterval);
            }
        }

        if (self.powerVdev && self.powerVdev.get("metrics:level") !== status) {
            self.powerVdev.performCommand("update", status);
        }
    };
};

LGWebOSTV.prototype.stop = function() {
    var self = this;

    if (self.checkAliveInterval) {
        clearInterval(self.checkAliveInterval);
    }

    this.tv.off("connect", self.onWebOSConnect);
    this.tv.off("error", self.onWebOSError);
    this.tv.off("close", self.onWebOSClose);
    this.tv.off("prompt", self.onWebOSPrompt);
    this.tv.off("connecting", self.onWebOSConnecting);

    if (self.powerVdev) {
        this.controller.devices.remove(self.powerVdev.id);
        self.powerVdev = null;
    }

    if (self.volumeVdev) {
        this.controller.devices.remove(self.volumeVdev.id);
        self.volumeVdev = null;
    }

    self.appVdevs.forEach(function(vdev) {
        this.controller.devices.remove(vdev.id);
    });
    self.appVdevs = [];

    LGWebOSTV.super_.prototype.stop.call(this);
};