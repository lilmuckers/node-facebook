
var querystring	= require('querystring'),
	crypto 	= require('crypto'),
	https 	= require('https'),
	url 	= require('url');


var facebook = function(appId, appSecret, callbackUrl){
	this.appId = appId;
	this.appSecret = appSecret;
	this.callbackUrl = callbackUrl;
	this.authUrl = 'https://www.facebook.com/dialog/oauth';
	this.accessUrl = 'https://graph.facebook.com/oauth/access_token';
}
facebook.prototype.getAuthUrl = function(scope){
	if(typeof scope == 'object'){
		var scope = scope.join(',');
	} else {
		scope = '';
	}
	var data = {
		client_id	: this.appId,
		scope		: scope,
		redirect_uri	: this.callbackUrl
	};
	var query = querystring.stringify(data);
	return this.authUrl + '?' + query;
}
facebook.prototype.importResponse = function(res){
	//check if there was an error from facebook.
	if(req.param('error_reason', false)){
		throw new Error(req.param('error_description', 'There was an unknown error at Facebook'));
	}
	
	this.code = req.param('code', false);
	if(!this.code){
		throw new Error('No valid code was returned from FB');
	}
	return this;
}
facebook.prototype._getAccessToken = function(callback){
	if(!this.accessToken){
		var data = {
			client_id	: this.appId,
			redirect_uri	: this.callbackUrl,
			client_secret	: this.appSecret,
			code		: this.code
		};
		this._send(this.accessUrl, data, 'GET', function(err, data){
			if(err){
				throw new Error(err);
			}
			var results;
			try{
				results = JSON.parse(data);
			} catch(e) {
				results = querystring.parse(data);
			}
			this.accessToken = results['access_token'];
			this.refreshToken = results['refresh_token'];
			callback(this.accessToken, this.refreshToken);
		}.bind(this));
		return this;
	}
	callback(this.accessToken, this.refreshToken);
	return this;
}
facebook.prototype.get = function(url, query, callback){
	this._getAccessToken(function(accessToken, refreshToken){
		query['access_token'] = accessToken;
		this._send(url, query, callback);
	});
}
facebook.prototype._send = function(url, query, method, callback){
	var creds = crypto.createCredentials({});
	
	//perform transforms on the url data to make it work
	var parsedUrl = url.parse(url, true);
	if(!method) method = 'GET';
	if(parsedUrl.protocol == 'https:' && !parsedUrl.port) parsedUrl.port = 443;
	
	//the basic headers that are required
	var headers = {};
	headers['Host'] = parsedUrl.host;
	headers['Content-Length'] = 0;
	
	//set up the request
	var result = '';
	var options = {
		host		: parsedUrl.hostname,
		port		: parsedUrl.port,
		path		: parsedUrl.pathname + '?' + querystring.stringify(query),
		method		: method,
		headers		: headers
	};

	//perform that request, holmes!
	request = https.request(options, function(res){
		res.addListener('data', function(chunk){
			result += chunk;
		});
		res.addListener('end', function() {
			if(res.statusCode != 200){
				callback({ statusCode: res.statusCode, data: result});
			} else {
				callback(null, result, res);
			}
		});
	});
	request.on('error', function(e){
		callback(e);
	});
	request.end();
}
facebook.prototype.base64UrlToBase64 = function(str){
	var padding = (4-(str.length%4));
	for(var i = 0; i < padding; i++){
		str = str+'=';
	}
	return str.replace(/\-/g, '+').replace(/_/g, '/');
}
facebook.prototype.base64UrlDecode = function(encoded){
	var enc = this.base64UrlToBase64(encoded);
	return (new Buffer(enc || '', 'base64')).toString('ascii');
}
facebook.prototype.processSignedRequest = function(signedRequest){
	var data = signedRequest.split('.');
	var reqSignature = this.base64UrlToBase64(data[0]);
	var payload = data[1];
	
	//decode the payload
	data = this.base64UrlDecode(payload);
	data = JSON.parse(data);

	//check the encoding algorithm
	if(data.algorithm.toUpperCase() !== 'HMAC-SHA256'){
		throw new Error('Unknown signature algorithm. Expected HMAC-SHA256');
	}
	
	//verify the request
	var hmac = crypto.createHmac('sha256', this.appSecret);
	hmac.update(payload);
	var expectedSignature = hmac.digest('base64');
	if(reqSignature != expectedSignature){
		console.log(reqSignature, expectedSignature);
		throw new Error('Invalid signature sent');
	}
	
	//This request was validated successfully - hooray!
	//give back the decoded data
	return data;	
}
exports.facebook = facebook;

exports.canvas = function(fbObj){
	return function(req, res, next){
		var signedRequest = req.param('signed_request', false);
		if(signedRequest){
			var data = fbObj.processSignedRequest(signedRequest);
			console.log(data);
		}
		next();
	}
};



