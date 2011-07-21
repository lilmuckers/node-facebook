
var querystring	= require('querystring'),
	crypto 	= require('crypto'),
	https 	= require('https'),
	URL 	= require('url');


var Facebook = function(appId, appSecret, callbackUrl){
	this.appId = appId;
	this.appSecret = appSecret;
	this.callbackUrl = callbackUrl;
	this.authUrl = 'https://www.facebook.com/dialog/oauth';
	this.accessUrl = 'https://graph.facebook.com/oauth/access_token';
}
Facebook.prototype.getAuthUrl = function(scope){
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
Facebook.prototype.importResponse = function(res){
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
Facebook.prototype._getAccessToken = function(callback){
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
Facebook.prototype.get = function(accessToken, url, query, callback, method){
	if(!query) query = {};
	query['access_token'] = accessToken;
	this._send(url, query, method ? method : 'GET', function(err, result, response){
		if(!err){
			result = JSON.parse(result);
		}
		callback(err, result, response);
	});
}
Facebook.prototype._send = function(url, query, method, callback){
	var creds = crypto.createCredentials({});
	
	//perform transforms on the url data to make it work
	var parsedUrl = URL.parse(url, true);
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
Facebook.prototype.base64UrlToBase64 = function(str){
	var padding = (4-(str.length%4));
	for(var i = 0; i < padding; i++){
		str = str+'=';
	}
	return str.replace(/\-/g, '+').replace(/_/g, '/');
}
Facebook.prototype.base64UrlDecode = function(encoded){
	var enc = this.base64UrlToBase64(encoded);
	return (new Buffer(enc || '', 'base64')).toString('ascii');
}
Facebook.prototype.processSignedRequest = function(signedRequest){
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
		throw new Error('Invalid signature sent');
	}
	
	//This request was validated successfully - hooray!
	//give back the decoded data
	return data;	
}
exports.facebook = Facebook;

function FacebookAPI(fbObj){
	this.fb = fbObj;
	this._graphBaseUrl = 'https://graph.facebook.com/';
}
FacebookAPI.prototype.getUser = function(userId, callback){
	var url = this._graphBaseUrl;
	if(userId){
		url += userId;
	} else {
		url += 'me';
	}
	this.fb.get(this.accessToken, url, null, callback);
}

exports.facebookapi = FacebookAPI;

exports.canvas = function(fbObj){
	return function(req, res, next){
		var signedRequest = req.param('signed_request', false);
		if(signedRequest || req.session.accessToken){
			if(signedRequest){
				var data = fbObj.processSignedRequest(signedRequest);
				if(data['oauth_token']){
					req.session.accessToken = data['oauth_token'];
				}
			} else if (req.session.accessToken){
				var data = {};
			}
			
			var fbapi = new FacebookAPI(fbObj);
			fbapi.accessToken = req.session.accessToken;

			//set the access token data if it's available
			if(data['oauth_token']){
				req.session.accessToken = data['oauth_token'];
			}

			//add a facebook object to the request object
			var fb = {};
			if(!data.user_id){
				fb.authed = false;
				fb.authenticate = function(scope){
					var url = fbObj.getAuthUrl(scope);
					res.end('<script type="text/javascript">top.location.href = "'+url+'";</script>');	
				}
			} else {
				fb.accessToken = req.session.accessToken;
				fb.authed = true;
			}
			for(var k in data){
				if(k != 'oauth_token' && k != 'expires' && k != 'algorithm' && k != 'issued_at'){
					fb[k] = data[k];
				}
			}
			fb.api = fbapi;
			req.fb = fb;
		}
		next();
	}
};



