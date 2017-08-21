const dgram = require('dgram');

const PORT = 20055;

var sock = null;
var ip_addr;
var counter = 0;
var callbacks = {};

var checksum = function(buf) {
    if (buf.length < 8)
        return 0;
    var sum = 0;
    for (var i = 0; i < 7; i++)
        sum += buf.readUInt8(i);
    return sum % 256;
};

var getSequenceNumber = function() {
    var c = counter || 0;
    c++;
    if (c > 0xff)
        c = 0;
    counter = c;
    return counter;
}

var getCallbackNumber = function(buf) {
    const type = buf.readUInt8(1);
    const counter = buf.readUInt8(6);
    return (type * 256) + counter;
}

var sendSimplePackage = function(type, fn) {
    const dbuf = Buffer.alloc(8);   
    dbuf.writeUInt8(0xbb, 0);
    dbuf.writeUInt8(type, 1);
    dbuf.writeUInt8(getSequenceNumber(), 6);
    const csm = checksum(dbuf);
    dbuf.writeUInt8(csm, 7);
    const ebuf = Buffer.alloc(64 - 8);
    const buf = Buffer.concat([dbuf, ebuf]);
    const cbnum = getCallbackNumber(buf);
    callbacks[cbnum] = fn;
    send(buf);
}

var send = function(buf) {
    if (!sock)
        return;
    sock.send(buf, 0, buf.length, PORT, ip_addr, function(err, bytes) {
        if (err) {
             console.log(err);
        }
        msg = null;
    });
}

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

module.exports.setOutput = function(pin, state) {
    var i_pin = parseInt(pin);
    if (!i_pin || i_pin < 1 || i_pin > 55)
         return;
    const dbuf = Buffer.alloc(8);   
    dbuf.writeUInt8(0xbb, 0);
    dbuf.writeUInt8(0x40, 1);
    dbuf.writeUInt8(i_pin - 1, 2);
    dbuf.writeUInt8(state ? 0 : 1, 3);
    dbuf.writeUInt8(getSequenceNumber(), 6);
    const csm = checksum(dbuf);
    dbuf.writeUInt8(csm, 7);
    const ebuf = Buffer.alloc(64 - 8);
    const buf = Buffer.concat([dbuf, ebuf]);
    send(buf);
}
