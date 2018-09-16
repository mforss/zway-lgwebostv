WakeOnLan = function() {}

WakeOnLan.prototype.createMagicPacket = function(mac) {
    function allocBuffer(s) {
        return new Uint8Array(s)
    }

    function copyArr(source, target, targetStart, start, end) {
        if (!target instanceof Uint8Array) throw new TypeError('argument should be a Uint8Array')
        if (!start) start = 0
        if (!end && end !== 0) end = source.length
        if (targetStart >= target.length) targetStart = target.length
        if (!targetStart) targetStart = 0
        if (end > 0 && end < start) end = start

        // Copy 0 bytes; we're done
        if (end === start) return 0
        if (target.length === 0 || source.length === 0) return 0

        // Fatal error conditions
        if (targetStart < 0) {
            throw new RangeError('targetStart out of bounds')
        }
        if (start < 0 || start >= source.length) throw new RangeError('Index out of range')
        if (end < 0) throw new RangeError('sourceEnd out of bounds')

        // Are we oob?
        if (end > source.length) end = source.length
        if (target.length - targetStart < end - start) {
            end = target.length - targetStart + start
        }

        var i,
            len = end - start;

        if (source === target && typeof Uint8Array.prototype.copyWithin === 'function') {
            // Use built-in when available, missing from IE11
            source.copyWithin(targetStart, start, end)
        } else if (source === target && start < targetStart && targetStart < end) {
            // descending copy from end
            for (i = len - 1; i >= 0; --i) {
                target[i + targetStart] = source[i + start]
            }
        } else {
            Uint8Array.prototype.set.call(
                target,
                source.subarray(start, end),
                targetStart
            )
        }

        return len;
    }

    function createMagicPacket(mac) {
        var mac_bytes = 6;
        var mac_buffer = allocBuffer(mac_bytes),
            i;
        if (mac.length == 2 * mac_bytes + (mac_bytes - 1)) {
            mac = mac.replace(new RegExp(mac[2], 'g'), '');
        }
        if (mac.length != 2 * mac_bytes || mac.match(/[^a-fA-F0-9]/)) {
            throw new Error("malformed MAC address '" + mac + "'");
        }

        for (i = 0; i < mac_bytes; ++i) {
            mac_buffer[i] = parseInt(mac.substr(2 * i, 2), 16);
        }

        var num_macs = 16,
            buffer = allocBuffer((1 + num_macs) * mac_bytes);
        for (i = 0; i < mac_bytes; ++i) {
            buffer[i] = 0xff;
        }
        for (i = 0; i < num_macs; ++i) {
            copyArr(mac_buffer, buffer, (i + 1) * mac_bytes, 0, mac_buffer.length)
        }
        return buffer;
    }

    return createMagicPacket(mac);
};

WakeOnLan.prototype.wake = function(mac, opts, callback) {
    var self = this;

    if (typeof opts === 'function') {
        callback = opts;
        opts = undefined;
    }

    opts = opts || {};

    var address = opts['address'] || '255.255.255.255',
        numPackets = opts['numPackets'] || 3,
        packetInterval = opts['packetInterval'] || 100,
        port = opts['port'] || 9,
        magicPacket = self.createMagicPacket(mac),
        socket = new sockets.udp(),
        sendres,
        timerId,
        i = 0;

    socket.broadcast();

    function sendWoL() {
        i += 1;

        try {
            console.log("[LGWebOSTV] Broadcasting wake on lan packet to interface with MAC-adress: " + mac + " via address: " + address + ":" + port);
            sendres = socket.sendto(magicPacket, address, port);
            socket.close();
            console.log("[LGWebOSTV] Wake on lan packet sent with result: " + sendres);

            if (i === numPackets) {
                if (timerId) {
                    clearTimeout(timerId);
                }

                callback();
            } else if (i < numPackets) {
                timerId = setTimeout(sendWoL, packetInterval);
            } else {
                timerId = undefined;
                callback(new Error("Could not broadcast wake on lan packet after " + i + " attempts."));
            }
        } catch (error) {
            console.log("[LGWebOSTV] Error occured when trying to broadcast wake on lan packet to device with MAC-address: " + mac);

            if (timerId) {
                clearTimeout(timerId);
            }

            callback(error);
        }
    }

    sendWoL();
};