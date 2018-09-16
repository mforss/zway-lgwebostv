/*
The MIT License (MIT)

Copyright (c) Sebastian Raff

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

LGTV = function(config) {
	var self = this;
	var configuration = {};
	configuration.url = 'ws://' + config.ip + ':3000';
	configuration.timeout = config.timeout || 15000;
	configuration.reconnect = typeof config.reconnect === 'undefined' ? 5000 : config.reconnect;
	configuration.clientKey = config.clientKey;
	configuration.location = config.location;

	var autoReconnect = true,
		reconnectAttempts = 0,
		client,
		connection = {},
		isPaired = false,
		pairing,
		lastError,
		specializedSockets = {},
		callbacks = {},
		cidCount = 0,
		cidPrefix = ('0000000' + (Math.floor(Math.random() * 0xFFFFFFFF).toString(16))).slice(-8);

	function getCid() {
		return cidPrefix + ('000' + (cidCount++).toString(16)).slice(-4);
	}

	pairing = fs.loadJSON(configuration.location + '/pairing.json');

	this.register = function() {
		if (isPaired === true) {
			return;
		}

		pairing['client-key'] = configuration.clientKey || undefined;

		self.send('register', undefined, pairing, function(err, res) {
			if (!err && res) {
				if (res['client-key']) {
					isPaired = true;
					self.emit('connect', res['client-key']);
				} else {
					self.emit('prompt');
				}
			} else {
				self.emit('error', err);
			}
		});
	};

	this.request = function(uri, payload, cb) {
		self.send('request', uri, payload, cb);
	};

	this.subscribe = function(uri, payload, cb) {
		self.send('subscribe', uri, payload, cb);
	};

	this.send = function(type, uri, /* optional */ payload, /* optional */ cb) {
		if (typeof payload === 'function') {
			cb = payload;
			payload = {};
		}

		if (!connection.connected) {
			if (typeof cb === 'function') {
				cb(new Error('not connected'));
			}
			return;
		}

		var cid = getCid();

		var json = JSON.stringify({
			id: cid,
			type: type,
			uri: uri,
			payload: payload
		});

		if (typeof cb === 'function') {
			switch (type) {
				case 'request':
					callbacks[cid] = function(err, res) {
						// Remove callback reference
						delete callbacks[cid];
						cb(err, res);
					};

					// Set callback timeout
					setTimeout(function() {
						if (callbacks[cid]) {
							cb(new Error('timeout'));
						}
						// Remove callback reference
						delete callbacks[cid];
					}, configuration.timeout);
					break;

				case 'subscribe':
					callbacks[cid] = cb;
					break;

				case 'register':
					callbacks[cid] = cb;
					break;
				default:
					throw new Error('unknown type');
			}
		}
		connection.send(json);
	};

	this.getSocket = function(url, cb) {
		if (specializedSockets[url]) {
			cb(null, specializedSockets[url]);
			return;
		}

		self.request(url, function(err, data) {
			if (err) {
				cb(err);
				return;
			}

			var special = new sockets.websocket(data.socketPath);
			special.onconnect = function(conn) {
				specializedSockets[url] = new SpecializedSocket(conn);
				cb(null, specializedSockets[url]);
			};
			special.onerror = function(event) {
				self.emit('error', event.data);
			};
			special.onclose = function() {
				delete specializedSockets[url];
			};
		});
	};

	this.clientOnError = function(event) {
		if (lastError !== event.toString()) {
			self.emit('error', event.data);
		}
		lastError = event.toString();

		if (configuration.reconnect && autoReconnect) {
			reconnectAttempts++;
			if (reconnectAttempts < 3) {
				setTimeout(function() {
					self.connect(configuration.url);
				}, configuration.reconnect);
			} else {
				reconnectAttempts = 0;
			}
		}
	};

	this.clientOnOpen = function() {
		connection = client;
		connection.connected = true;
		autoReconnect = true;

		connection.onclose = function(e) {
			connection = {};
			isPaired = false;
			Object.keys(callbacks).forEach(function(cid) {
				delete callbacks[cid];
			});

			self.emit('close', e);
			if (configuration.reconnect && autoReconnect) {
				reconnectAttempts++;
				if (reconnectAttempts < 3) {
					setTimeout(function() {
						self.connect(configuration.url);
					}, configuration.reconnect);
				} else {
					reconnectAttempts = 0;
				}
			}
		};

		connection.onmessage = function(event) {
			var parsedMessage;
			if (event.data) {
				try {
					parsedMessage = JSON.parse(event.data);
				} catch (err) {
					self.emit('error', new Error('JSON parse error ' + event.data));
				}
				if (parsedMessage && callbacks[parsedMessage.id]) {
					if (parsedMessage.payload && parsedMessage.payload.subscribed) {
						// Set changed array on first response to subscription
						if (typeof parsedMessage.payload.muted !== 'undefined') {
							if (parsedMessage.payload.changed) {
								parsedMessage.payload.changed.push('muted');
							} else {
								parsedMessage.payload.changed = ['muted'];
							}
						}
						if (typeof parsedMessage.payload.volume !== 'undefined') {
							if (parsedMessage.payload.changed) {
								parsedMessage.payload.changed.push('volume');
							} else {
								parsedMessage.payload.changed = ['volume'];
							}
						}
					}
					callbacks[parsedMessage.id](null, parsedMessage.payload);
				}
			} else {
				self.emit('error', new Error('received message of unknown type ' + event.toString()));
			}
		};

		isPaired = false;
		self.register();
	};

	/**
	 *  Connect to TV using a websocket url (eg "ws://192.168.0.100:3000")
	 */
	this.connect = function(host) {
		autoReconnect = true;

		if (connection.connected && !isPaired) {
			self.register();
		} else if (!connection.connected) {
			self.emit('connecting', host);
			connection = {};
			isPaired = false;
			client = new sockets.websocket(host);
			client.onopen = self.clientOnOpen;
			client.onerror = self.clientOnError;
		}
	};

	this.disconnect = function() {
		autoReconnect = false;

		if (connection && connection.close) {
			connection.close();
		}

		Object.keys(specializedSockets).forEach(
			function(k) {
				specializedSockets[k].close();
			}
		);
	};

	this.turnOff = function(callback) {
		self.request('ssap://system/turnOff', callback);
	};

	this.getForegroundAppInfo = function(callback) {
		self.request('ssap://com.webos.applicationManager/getForegroundAppInfo', callback);
	};

	this.getAppInfo = function(appId, callback) {
		self.request('ssap://com.webos.applicationManager/getAppInfo', {
			id: appId
		}, callback);
	};

	this.subscribeToForegroundAppInfo = function(callback) {
		self.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', callback);
	};

	this.subscribeToAudio = function(callback) {
		self.subscribe('ssap://audio/getStatus', callback);
	};

	this.setVolume = function(level) {
		self.request('ssap://audio/setVolume', {
			volume: level
		});
	};

	this.setMute = function(state) {
		self.request('ssap://audio/setMute', {
			mute: state
		});
	};

	this.launchApp = function(appId) {
		self.request('ssap://system.launcher/launch', {
			id: appId
		});
	};
};

inherits(LGTV, EventEmitter2);