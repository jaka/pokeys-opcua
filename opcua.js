
const IP = '10.82.4.50'

const updateDelayMS = 100;

/*************************/
const opcua = require("node-opcua");
const pokeys = require('./pokeys');

var inputs = [];
var outputs = [];
var analoginputs = [];
var analogoutputs = [];
var easySensors = [];

var inputsState = {};
var analoginputsState = {};
var easySensorsState = {};

var server = new opcua.OPCUAServer({
    port: 4334,
    resourcePath: 'Pokeys1',
    buildInfo : {
        productName: "Pokeys57E",
        buildNumber: "1",
        buildDate: new Date(2017, 10, 3)
    }
});
var device;

/* EasySensors */

function constructEasySensorAddressSpace() {
    console.log('EasySensors configuration: ' + easySensors.toString());

    const addressSpace = server.engine.addressSpace;

    for (var i = 0, len = easySensors.length; i < len; i++) {
        var nr = easySensors[i];
        (function(nr) {
            addressSpace.addVariable({
                componentOf: device,
                browseName: 'EasySensor ' + easySensorsState[nr].id,
                nodeId: 'ns=1;s=easysensor' + nr,
                dataType: 'Double',
                value: {
                    get: function () {
                        if (!easySensorsState[nr] || !easySensorsState[nr].value)
                            return opcua.StatusCodes.Bad;
                        return new opcua.Variant({
                            dataType: opcua.DataType.Double, value: easySensorsState[nr].value
                        });
                    }
                }
            });
        })(nr);
    }
}

function easySensorWatcher() {
    o = 0;
    var getThirteenEasySensorValues = function () {
        var go = 0;
        for (i = 0; i < 13; i++)
             if (easySensors.indexOf(o + i) != -1)
                 go = 1;
        if (go) {
            pokeys.getEasySensorValues(o, function(err, buf) {
                if (err || !buf)
                    return;
                for (i = 0; i < 13; i++) {
                    if (easySensors.indexOf(o + i) != -1) {
                        var sensor = easySensorsState[o + i] || {};
                        sensor.value = buf.readUInt16LE(8 + (4 * i)) / 100.0;
                    }
                }
                o += 13;
                if (o < 99)
                    setTimeout(getThirteenEasySensorValues, updateDelayMS / 5);
            });
        }
        else {
            o += 13;
            if (o < 99)
                getThirteenEasySensorValues();
        }
    };
    getThirteenEasySensorValues();
}

var enumerateEasySensors = function(o, buf) {
    if (!buf)
        return;
    for (var i = 0; i < 4; i++) {
        const offset = (12 * i) + 8;
        const type = buf.readUInt8(offset);
        if (!type)
          continue;
        const id = buf.slice(offset + 4, offset + 12);
        if (!easySensorsState[o + i])
          easySensorsState[o + i] = {};
        easySensorsState[o + i].id = type.toString() + id.toString('hex');
        easySensors.push(o + i);
    }
}

var initializeEasySensors = function() {
    var offset = 0;
    var getFourEasySensor = function () {
        pokeys.getEasySensorSettings(offset, function(err, buf) {
            if (err || !buf)
                return;
            enumerateEasySensors(offset, buf);
            offset += 4;
            if (offset < 99)
                setTimeout(getFourEasySensor, 100);
            else {
                setInterval(easySensorWatcher, 3 * updateDelayMS);
                constructEasySensorAddressSpace();
            }
        });
    };
    getFourEasySensor();
}

/* IO */

function constructIOAddressSpace() {

    console.log('Pin configuration:');
    console.log('Inputs: ' + inputs.toString());
    console.log('Outputs: ' + outputs.toString());
    console.log('Analog inputs: ' + analoginputs.toString());
    console.log('Analog outputs: ' + analogoutputs.toString());

    const addressSpace = server.engine.addressSpace;

    for (var i = 0, len = inputs.length; i < len; i++) {
        var pin = inputs[i];
        (function(pin) {
            addressSpace.addVariable({
                componentOf: device,
                browseName: 'Input pin ' + pin.toString(),
                nodeId: 'ns=1;s=input' + pin.toString(),
                dataType: 'Boolean',
                value: {
                    get: function () {
                        if (!inputsState.hasOwnProperty(pin))
                            return opcua.StatusCodes.Bad;
                    	return new opcua.Variant({
                        	dataType: opcua.DataType.Boolean, value: inputsState[pin] ? true : false
                    	});
                	}
            	}
        	});
        })(pin);
    }

    for (var i = 0, len = analoginputs.length; i < len; i++) {
        var pin = analoginputs[i];
        (function(pin) {
            addressSpace.addVariable({
                componentOf: device,
                browseName: 'Analog input pin ' + pin.toString(),
                nodeId: 'ns=1;s=analog_input' + pin.toString(),
                dataType: 'Double',
                value: {
                    get: function () {
                        if (!analoginputsState[pin])
                            return opcua.StatusCodes.Bad;
                        return new opcua.Variant({
                            dataType: opcua.DataType.Double, value: analoginputsState[pin]
                        });
                	}
            	}
        	});
        })(pin);
    }

    for (var i = 0, len = outputs.length; i < len; i++) {
        var pin = outputs[i];
		(function(pin) {
			addressSpace.addVariable({
		    	componentOf: device,
                browseName: 'Output pin ' + pin.toString(),
                nodeId: 'ns=1;s=output' + pin.toString(),
                dataType: 'Boolean',
                value: {
                    get: function() {
                        return new opcua.Variant({
                            dataType: opcua.DataType.Boolean, value: inputsState[pin] ? true : false
                        });
                    },
                    set: function(variant) {
                        var state;
                        if (typeof(variant.value) === 'string')
                            state = (variant.value.toLower() === 'on');
                        else if (typeof(variant.value) === 'number')
                            state = (variant.value === 1);
                        else
                            state = !!variant.value;
                        pokeys.setOutput(pin, state);
                    	return opcua.StatusCodes.Good;
                    }
                }
           });
        })(pin);
    }
}

var updateInputs = function(err, buf) {
    if (err || !buf)
        return;
    for (var block = 0; block < 7; block++) {
        var inputs = buf.readUInt8(block + 8);
        for (var pin = 1; pin <= 8; pin++) {
            var p = 1 << (pin - 1)
            inputsState[8 * block + pin] = inputs & p ? 1 : 0;
        }
    }
}
var updateAnalogInputs = function(err, buf) {
    if (err || !buf)
        return;
    for (var pin = 0; pin < 7; pin++) {
        var value = buf.readUInt16BE((2 * pin) + 8) / 4096;
        analoginputsState[41 + pin] = value;
    }
}

function IOWatcher() {
    pokeys.getInputStatus(updateInputs);
    pokeys.getAnalogInputStatus(updateAnalogInputs);
}

var enumerateIO = function(err, buf) {
    if (err || !buf)
        return;
    for (var pin = 1; pin < 56; pin++) {
        var pinSettings = buf.readUInt8(pin + 7);
        if (pinSettings & 0x2)
            inputs.push(pin);
        if (pinSettings & 0x4)
            outputs.push(pin);
        if (pinSettings & 0x8)
            analoginputs.push(pin);
        if (pinSettings & 0x10)
            analogoutputs.push(pin);
    }
    setInterval(IOWatcher, updateDelayMS);
    constructIOAddressSpace();
}

var initializeIO = function() {
    pokeys.getBlockInputOutputSettings(enumerateIO);
}

function startServer() {
    const addressSpace = server.engine.addressSpace;
    device = addressSpace.addObject({
        organizedBy: addressSpace.rootFolder.objects,
        browseName: "MyPokey"
    });
    server.start(function() {
        console.log('Server is now listening at port', server.endpoints[0].port);
        console.log('Press CTRL+C to stop.');
        var endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
        console.log('The primary server endpoint url is', endpointUrl);
    });
}

pokeys.connect(IP);
server.initialize(function() {
    console.log('Server initialized.');
    startServer();
    initializeEasySensors();
    initializeIO();
});
