'use strict';
const _ = require('lodash');
/**
 * This is a collection of properties and utilities to help API developers respond to API requests, while keeping things consistent.
 */
class ResponseHelper {
	constructor(res){
		this._response = res;
	}
	/*********************************************************************/
	/* START IMUTTABLE PROPERTIES & GETTERS */
	/*********************************************************************/
	get rawResponse(){
		return this.getRawResponse();
	}
	getRawResponse(){
		return this._response;
	}
	/*********************************************************************/
	/* END IMUTTABLE PROPERTIES & GETTERS */
	/* START PUBLIC METHODS */
	/*********************************************************************/
	/**
	 * Responds with a 302 status code
	 * @param {string} uri - this is a complete url to an external location or the path portion of the uri for internal redirects.
	 */
	redirect(uri){
		this.rawResponse.redirect(302,uri);
	}
	/**
	 * Responds with a 302 status code
	 * @param {string} uri - this is a complete url to an external location or the path portion of the uri for internal reditects.
	 */
	found(uri){
		return this.redirect(uri);
	}
	/**
	 * Responds with a 301 status code
	 * @param {string} uri - this is a complete url to an external location or the path portion of the uri for internal reditects.
	 */
	movedPermanently(uri){
		return this.redirect(301,uri);
	}
	/**
	 * Responds with a 308 status code
	 * @param {string} uri - this is a complete url to an external location or the path portion of the uri for internal reditects.
	 */
	permanentRedirect(uri){
		return this.rawResponse.redirect(308,uri);
	}
	/**
	 * Used to provide json successful responsess
	 * @param {buffer | string | object | array} [payload] - An optional object to be serialized in the response, all properties will be flattened into the response object.
	 * @param {integer} [httpResponseStatusCode=200] - An optional http response code to be used instead of 200.
	 */
	send(payload, httpResponseStatusCode=200){
		this.rawResponse.status(httpResponseStatusCode);
		this.rawResponse.send(payload);
	}
	/**
	 * Used to provide json successful responsess
	 * @param {object} [payload] - An optional object to be serialized in the response, all properties will be flattened into the response object.
	 * @param {string} [msg] - An optional string to be provided under the msg property indicating a message to be used for troubleshooting or logging purposes.
	 * @param {integer} [httpResponseStatusCode=200] - An optional http response code to be used instead of 200.
	 */
	respond(payload=undefined, msg=undefined, httpResponseStatusCode=200){
		let mergedPayload = _.merge({},payload,{msg:msg});
		return this.send(mergedPayload, httpResponseStatusCode);
	}
	/**
	 * Used to provide json successful responsess
	 * @param {object} [payload] - An optional object to be serialized in the response, all properties will be flattened into the response object.
	 * @param {string} [msg] - An optional string to be provided under the msg property indicating a message to be used for troubleshooting or logging purposes.
	 * @param {integer} [httpResponseStatusCode=200] - An optional http response code to be used instead of 200.
	 */
	respondWithAuthorizationHeader(authHeaderValue=undefined,payload=undefined, httpResponseStatusCode=200){
		this.rawResponse.set('Authorization',authHeaderValue);
		this.rawResponse.status(httpResponseStatusCode);
		this.rawResponse.send(payload);
	}
	/**
	 * Used to provide json error responsess
	 * @param {Error| string} error - The Javascript Error that caused the issue. This will set the errorCode property, errorMsg property and additional error properties
	 * @param {object} [additionalProps] - An optional object to be serialized in the response for further context/error information, all properties will be flattened into the response object.
	 * @param {integer} [httpResponseStatusCode=400] - An optional http response code to be used instead of 400.
	 */
	respondWithError(error=undefined, additionalProps={}, httpResponseStatusCode=400){
		let errorMsg = 'An unknown error was encountered.';
		let errorCode = 'ThrownError';
		let errorDetails = {};
		//plain string messages are allowed
		if(_.isString(error)){
			errorMsg = error;
		}
		else {
			//determine errorMsg
			if(_.has(error,'errorMsg')){
				errorMsg = error.errorMsg;
			}
			else if(_.has(error,'message')){
				errorMsg = error.message;
			}
			//determine errorCode
			if(_.has(error,'errorCode')){
				errorCode = error.errorCode;
			}
			//determine additional error details
			if(_.has(error,'errorDetails')){
				errorDetails = _.merge({},additionalProps,error.errorDetails);
			}
			//If a stack trace is provided add it to the errorDetails
			if(_.has(error,'stack')){
				errorDetails.stackTrace = error.stack;
			}
		}
		return this.respondWithErrorDetails(errorCode, errorMsg, errorDetails, httpResponseStatusCode);
	}
	/**
	 * Used to provide json error responsess
	 * @param {string} errorCode - An optional string that identifies the type of application error encountered.
	 * @param {string} errorMsg - A message to be used for troubleshooting or logging purposes.
	 * @param {object} [additionalProps] - An optional object to be serialized in the response for further context/error information, all properties will be flattened into the response object.
	 * @param {integer} [httpResponseStatusCode=400] - An optional http response code to be used instead of 400.
	 */
	respondWithErrorDetails(errorCode=undefined,errorMsg=undefined,additionalProps={},httpResponseStatusCode=400){
		let payload = _.merge(
			{}, 
			{
				errorCode: errorCode,
				errorMsg: errorMsg,
			},
			additionalProps
		);
		return this.respond(payload,undefined,httpResponseStatusCode);
	}
	/**
	 * Used to provide a successful json payload
	 * @param {object} [payload] - An optional object to be serialized in the response, all properties will be flattened into the response object.
	 */
	ok(payload={}){
		return this.respond(payload);
	}
	/**
	 * Used to indicate a successful resource creation.
	 * @param {string} location - this is the path portion of the uri to the get request that will retrieve the newly created resource.
	 * @param {object} [createdResourceSummary] - An optional object that describes the created resource in summary form. For example id,name,description... This will be provided in the created property.
	 */
	created(location,createdResourceSummary){
		this.rawResponse.location(location);
		return this.respond({
			created: createdResourceSummary
		});
	}
	/**
	 * Used to provide a bad request (400) response from a json error
	 * @param {Error} error - The Javascript Error that caused the issue. This will set the errorCode property to JsError, errorMsg property to error.message and if error.stackTrace is found the stackTrace property will be set.
	 */
	badRequest(error){
		return this.respondWithError(error);
	}
	//401
	unauthorized(errorMsg){
		this.rawResponse.set('WWW-Authenticate','Bearer');
		return this.respondWithErrorDetails(401,errorMsg,undefined,401);
	}
	//403
	forbidden(errorMsg,requiredScopes=[]){
		this.rawResponse.set('WWW-Authenticate',`Bearer scope="${requiredScopes.join(' ')}", error="${errorMsg}"`);
		return this.respondWithErrorDetails(403,errorMsg,undefined,403);
	}
	//404
	notFound(errorMsg='Not Found'){
		return this.respondWithErrorDetails(404,errorMsg,undefined,404);
	}
	//500
	internalServerError(error){
		return this.respondWithError(error,undefined,500);
	}
	//200
	deprecated(){
		//make sure to add Deprecated warning https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Warning
		this.rawResponse.set('Warning', '299 - "Deprecated API this may be removed in the future"');
		return this.send({});
	}
	//410
	gone(){		//Unfortunately the Express framework mutates their response object so this member cannot be frozen.
		//Object.freeze(this._response);
		//make sure to add Deprecated warning https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Warning
		this.rawResponse.set('Warning', '299 - "Deprecated API this may be removed in the future"');
		return this.send({},410);
	}
	sendBasicAuthChallenge(){
		this.rawResponse.set('WWW-Authenticate','Basic realm=Authorization Required');
		return this.send({},'Unauthorized',401);
	}
	/*********************************************************************/
	/* END PUBLIC METHODS */
	/*********************************************************************/
	toJSON(){
		return {
			locals: this.rawResponse.locals
		};
	}
}

module.exports = ResponseHelper;