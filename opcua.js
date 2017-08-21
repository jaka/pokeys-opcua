const opcua = require("node-opcua");
const pokeys = require('./pokeys');

pokeys.connect('10.82.4.50');

var server = new opcua.OPCUAServer({
    port: 4334,
    resourcePath: 'Pokeys1',
    buildInfo : {
        productName: "Pokeys57E",
        buildNumber: "1",
        buildDate: new Date(2017, 8, 20)
    }
});

var inputs = [];
var outputs = [];
var analoginputs = [];
var analogoutputs = [];
var inputsState = {};

function getPinStatus(pin) {
    if (!inputsState.hasOwnProperty(pin))
        return 1;
    return inputsState[pin];
}

function construct_my_address_space(server) {
    
    var addressSpace = server.engine.addressSpace;
        
    var device = addressSpace.addObject({
        organizedBy: addressSpace.rootFolder.objects,
        browseName: "MyPokey"
    });

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
                    	return new opcua.Variant({
                        	dataType: opcua.DataType.Boolean, value: inputsState[pin] ? true : false
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

function start_server() {
    construct_my_address_space(server);
    server.start(function() {
        console.log('Server is now listening at port', server.endpoints[0].port);
        console.log('Press CTRL+C to stop');
        var endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
        console.log('The primary server endpoint url is', endpointUrl);
    });
}

var updateInputs = function(buf) {
  for (var block = 0; block < 8; block++) {
      var inputs = buf.readUInt8(block + 8);
      for (var pin = 1; pin <= 8; pin++) {
          var p = 1 << (pin - 1)
          inputsState[8 * block + pin] = inputs & p ? 1 : 0;
      }
  }
}

function inputsWatcher() {
  pokeys.getInputStatus(updateInputs)
  setTimeout(inputsWatcher, 100);
}

var enumeratePins = function(buf) {
    const type = buf.readUInt8(1);

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
    console.log('Inputs: ' + inputs);
    console.log('Outputs: ' + outputs);
    console.log('Analog inputs: ' + analoginputs);
    console.log('Analog outputs: ' + analoginputs);
    inputsWatcher();
    start_server();
}

var post_initialize = function() {
    console.log('Initialized');
    pokeys.getBlockInputOutputSettings(enumeratePins);
}

server.initialize(post_initialize);
