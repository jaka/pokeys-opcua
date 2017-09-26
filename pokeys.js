const async = require('async');
const dgram = require('dgram');

const PORT = 20055;

var sock = null;
var ip_addr = null;
var counter = 0;
var callbacks = {};

var queue = async.queue(work, 1);
var to = null;

function send(buf) {
    if (!sock) {
        return;
    }
    sock.send(buf, 0, buf.length, PORT, ip_addr, function(err, bytes) {
        if (err)
             console.log(err);
        msg = null;
    });
}

function work(item, cb) {
    var callbackTimeOut = function(buf) {
        to = null;
        cb('Timeout occured!', null);
    }
    var callback = function(buf) {
        if (to) {
            clearTimeout(to);
            to = null;
        }
        cb(null, buf);
    };
    if (!item.hasOwnProperty('buf')) {
        return cb();
    }
    send(item.buf);
    const cbnum = getCallbackNumber(item.buf);
    callbacks[cbnum] = callback;
    to = setTimeout(callbackTimeOut, 1000);
}

function getSequenceNumber() {
    var c = counter || 0;
    c++;
    if (c > 0xff)
        c = 0;
    counter = c;
    return counter;
};

var getCallbackNumber = function(buf) {
    const type = buf.readUInt8(1);
    const counter = buf.readUInt8(6);
    return (type * 256) + counter;
}

function checksum(buf) {
    if (buf.length < 8)
        return 0;
    var sum = 0;
    for (var i = 0; i < 7; i++)
        sum += buf.readUInt8(i);
    return sum % 256;
};

function sendPackage(buf, fn) {
    const counter = getSequenceNumber();
    buf.writeUInt8(counter, 6);
    const csm = checksum(buf);
    buf.writeUInt8(csm, 7);
    var work = {
        buf: buf
    };
    queue.push(work, fn);
}

var createSimplePackage = function(type) {
    const buf = Buffer.alloc(64);
    buf.writeUInt8(0xbb, 0);
    buf.writeUInt8(type, 1);
    return buf;
}

var sendSimplePackage = function(type, fn) {
    const buf = createSimplePackage(type);
    sendPackage(buf, fn);
}

/* ****** */

module.exports.connect = function(ip_address) {
    ip_addr = ip_address;
    var opts = {
        type: 'udp4',
        reuseAddr: true
    };
    sock = dgram.createSocket(opts);
    sock.on('error', function(err) {
        throw 'Socket cannot be created';
    });
    sock.on('message', function(msg, info) {
        if (msg.length < 8)
            return;
        const csm = checksum(msg);
        if (csm != msg.readUInt8(7))
            return;
        const direction = msg.readUInt8(0);
        if (direction != 0xaa)
            return;
        const cbnum = getCallbackNumber(msg);
        if (callbacks.hasOwnProperty(cbnum)) {
            var fn = callbacks[cbnum];
            fn(msg);
            delete(callbacks[cbnum]);
        }
//console.log('Received %d bytes from %s:%d\n',msg.length, info.address, info.port);
    }); 
};

module.exports.getBlockInputOutputSettings = function(fn) {
    sendSimplePackage(0xc0, fn);
}

module.exports.getInputStatus = function(fn) {
    sendSimplePackage(0xcc, fn);
}

module.exports.getAnalogInputStatus = function(fn) {
    sendSimplePackage(0x3a, fn);
}

module.exports.getEasySensorSettings = function(offset, fn) {
    const buf = createSimplePackage(0x76);
    buf.writeUInt8(offset, 2);
	buf.writeUInt8(4, 3);
    sendPackage(buf, fn);
}

module.exports.getEasySensorValues = function(offset, fn) {
    const buf = createSimplePackage(0x77);
    buf.writeUInt8(offset, 2);
	buf.writeUInt8(14, 3);
    sendPackage(buf, fn);
}

module.exports.setOutput = function(pin, state) {
    var i_pin = parseInt(pin);
    if (!i_pin || i_pin < 1 || i_pin > 55)
        return;
    const buf = createSimplePackage(0x40);
    buf.writeUInt8(i_pin - 1, 2);
    buf.writeUInt8(state ? 0 : 1, 3);
    sendPackage(buf, function(err, buf) {});
}
