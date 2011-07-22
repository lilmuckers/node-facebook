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

exports.FacebookAPI = FacebookAPI;



