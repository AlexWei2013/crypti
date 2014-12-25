var async = require('async');
var util = require('util');
var ip = require('ip');
var Router = require('../helpers/router.js');
var params = require('../helpers/params.js');

//private
var modules, library, self;

//constructor
function Peer(cb, scope) {
	library = scope;
	self = this;

	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: 'loading'});
	});

	router.get('/', function (req, res) {
		self.filter({}, function (err, peers) {
			if (err) {
				return res.json({success: false, error: "Peers not found"});
			}
			res.json({success: true, peers: peers});
		});
	});

	router.get('/banned', function (req, res) {
		self.filter({status: 0}, function (err, peers) {
			if (err) {
				return res.json({success: false, error: "Peers not found"});
			}
			res.json({success: true, peers: peers});
		});
	});

	router.get('/connected', function (req, res) {
		self.filter({status: 2}, function (err, peers) {
			if (err) {
				return res.json({success: false, error: "Peers not found"});
			}
			res.json({success: true, peers: peers});
		});
	});

	router.get('/shared', function (req, res) {
		self.filter({sharePort: 1}, function (err, peers) {
			if (err) {
				return res.json({success: false, error: "Peers not found"});
			}
			res.json({success: true, peers: peers});
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: 'api not found'});
	});

	library.app.use('/api/peers', router);
	library.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error('/api/peers', err)
		res.status(500).send({success: false, error: err});
	});

	cb(null, this);
}
//public
Peer.prototype.run = function (scope) {
	modules = scope;
}

Peer.prototype.list = function (limit, cb) {
	limit = limit || 100;
	var params = {$limit: limit};

	library.db.all("select ip, port, state, os, sharePort, version from peers where state < 0 and sharePort = 1 ORDER BY RANDOM() LIMIT $limit", params, cb);
}

Peer.prototype.filter = function (filter, cb) {
	var limit = filter.limit || 100;
	delete filter.limit;

	var where = [];
	var params = {};
	Object.keys(filter).forEach(function (key) {
		where.push(key + " = " + '$' + key);
		params['$' + key] = filter[key];
	});

	params['$limit'] = limit;

	library.db.all("select ip, port, state, os, sharePort, version from peers" + (where.length ? (' where ' + where.join(' and ')) : '') + ' limit $limit', params, cb);
}

Peer.prototype.state = function (ip, port, state, clock, cb) {
	if (state == 0) {
		clock = clock || 10;
		clock = Date.now() + (clock * 60 * 1000);
	} else {
		clock = null;
	}
	var st = library.db.prepare("UPDATE peers SET state = $state, clock = $clock WHERE ip = $ip and port = $port;");
	st.bind({$state: state, $clock: clock, $ip: ip, $port: port});
	st.run(function (err) {
		err && library.logger.error('Peer#state', err);
		cb && cb()
	});
}

Peer.prototype.parsePeer = function (peer) {
	peer.ip = params.int(peer.ip);
	peer.port = params.int(peer.port);
	peer.state = params.int(peer.state);
	peer.os = params.string(peer.os);
	peer.sharePort = params.bool(peer.sharePort);
	peer.version = params.string(peer.version);
	return peer;
}

Peer.prototype.update = function (peer, cb) {
	library.db.serialize(function () {

		var params = {
			$ip: peer.ip,
			$port: peer.port,
			$state: peer.state,
			$os: peer.os,
			$sharePort: peer.sharePort,
			$version: peer.version
		}

		var st = library.db.prepare("INSERT OR IGNORE INTO peers (ip, port, state, os, sharePort, version) VALUES ($ip, $port, $state, $os, $sharePort, $version);");
		st.bind(params);
		st.run();

		var st = library.db.prepare("UPDATE peers SET state = $state, os = $os, sharePort = $sharePort, version = $version WHERE ip = $ip and port = $port;");
		st.bind(params);
		st.run();

		st.finalize(function (err) {
			err && library.logger.error('Peer#update', err);
			cb && cb()
		});
	});
}

Peer.prototype.count = function (cb) {
	var params = {};

	library.db.get("select count(rowid) as count from peers", params, function (err, res) {
		if (err){
			library.logger.error('Peer#count', err);
			return cb(err);
		}
		cb(null, res.count)
	})
}

//export
module.exports = Peer;
