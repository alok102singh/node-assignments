'use strict';
const RequestHelper = require('./RequestHelper');
class MutableRequestHelper extends RequestHelper {
	constructor(req){
		super(req);
	}
	setHeader(headerName,headerValue){
		this._request.set(headerName,headerValue);
	}
}
module.exports = MutableRequestHelper;