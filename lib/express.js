var FacebookAPI = require('./api.js').FacebookAPI;

exports.canvas = function(fbObj, autoAuth){
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

			if(signedRequest && autoAuth && !req.fb.authed){
				req.fb.authenticate(autoAuth);
				return;
			}
		}
		next();
	}
};

