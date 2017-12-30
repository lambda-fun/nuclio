net = require('net');

var json_ctype = 'application/json';

function Response(body=null, headers=null, content_type='text/plain', status_code=200) {
    this.body = body;
    this.headers = headers;
    this.content_type = content_type;
    this.status_code = status_code;

    if (!is_string(this.body)) {
	this.body = JSON.stringify(this.body);
	this.content_type = json_ctype;
    }
}

function log(level, message, with_data) {
    if (with_data === undefined) {
	with_data = {}
    }

    var record = {
	datetime: new Date().toISOString(),
	level: level,
	message: message,
	'with': with_data
    }
    socket.write('l' + JSON.stringify(record) + '\n');
}

function is_string(obj) {
    return typeof(obj) == 'string' || (obj instanceof String)
}

// Status reply is a list of [status, content]
function is_status_reply(handler_output) {
    if (!handler_output instanceof Array) {
	return false;
    }

    if (handler_output.length != 2) {
	return false;
    }

    if (typeof(handler_output[0]) != 'number') {
	return false;
    }

    return true;
}

function response_from_output(handler_output) {
    var response = {
        body: '',
        content_type: 'text/plain',
        headers: {},
        status_code: 200,
        body_encoding: 'text'
    };

    if (is_string(handler_output) || (handler_output instanceof Buffer)) {
        response.body = handler_output;
    } else if (is_status_reply(handler_output)) {
	response.status_code = handler_output[0]
	var body = handler_output[1];

	if (is_string(body) || (body instanceof Buffer)) {
	    response.body = body;
	} else {
	    response.body = JSON.stringify(body);
	    response.content_type = json_ctype;
	}
    } else if (handler_output instanceof Response) {
        response.body = handler_output.body;
        response.content_type = handler_output.content_type;
        response.headers = handler_output.headers;
        response.status_code = handler_output.status_code;
    } else { // other object
	response.body = JSON.stringify(handler_output);
	response.content_type = json_ctype;
    }

    if (response.body instanceof Buffer) {
	response.body = response.body.toString('base64');
	response.body_encoding = 'base64';
    }

    return response;
}

function send_reply(handler_output) {
    var response = response_from_output(handler_output);
    socket.write('r' + JSON.stringify(response) + '\n');
}

var context = {
    callback: send_reply,
    Response: Response,

    log_error: function(message) { log('error', message); },
    log_warn: function(message) { log('warning', message);},
    log_info: function(message) { log('info', message);},
    log_debug: function(message) { log('debug', message);},
    log_error_with: function(message, with_data) { log('error', message, with_data); },
    log_warn_with: function(message, with_data) { log('warning', message, with_data);},
    log_info_with: function(message, with_data) { log('info', message, with_data);},
    log_debug_with: function(message, with_data) { log('debug', message, with_data);},
};

if (require.main === module) {
    // ['node', '/path/to/wrapper.js', '/path/to/socket', '/path/to/handler.js']
    if (process.argv.length != 4) {
	console.error('error: wrong number of arguments');
	process.exit(1);
    }

    var socket = new net.Socket();
    var conn = process.argv[2];
    console.log('conn = ' + conn);
    if (/:/.test(conn)) { // TCP - host:port
	var parts = conn.split(':')
	var host = parts[1];
	var port = parseInt(parts[0]);

	socket.connect(port, host);
    } else { // UNIX
	socket.connect(conn);
    }

    // TODO: Use handler name
    var handler = require(process.argv[3]);

    socket.on('data', function(data) {
	try {
	    var evt = JSON.parse(data);
	    evt.body = new Buffer(evt.body, 'base64');
	    evt.timestamp = new Date(evt['timestamp'] * 1000);
	    handler.handler(context, evt);
	} catch (err) {
	    console.log('ERROR: ' + err);
	    var error_message = err.toString();

	    if (err.stack !== undefined) {
		console.log(err.stack);
		error_message += '\n' + err.stack;
	    }

	    var response = {
		body: 'Error in handler: ' + error_message,
		content_type: 'text/plain',
		headers: {},
		status_code: 500,
		body_encoding: 'text'
	    };

	    socket.write('r' + JSON.stringify(response) + '\n');
	}
    });
}
