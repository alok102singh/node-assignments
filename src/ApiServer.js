'use strict';
const _ = require('lodash');
const http = require('http');
const Express =  require('express');
const cookieParser =  require('cookie-parser');
const bodyParser = require('body-parser');
const swaggerJsDoc = require('swagger-jsdoc');
const cors = require('cors');
const glob = require('glob');
const helmet = require('helmet');//eslint-disable-line
const pathUtils = require('path');
const swaggerUi = require('swagger-ui-express');
const EventEmitter = require('events');
const { OpenApiValidator } = require('express-openapi-validate');
const Logger = require('./Logger');
const log = Logger.getInstance('MAIN-SERVER');
const ResponseHelper = require('./ResponseHelper');
const RequestHelper = require('./RequestHelper');
const MutableRequestHelper = require('./MutableRequestHelper');
const dbUtils = require('./utils/utils');

/** Server Status Object */
const STATUS = {
	UNKNOWN:'UNKNOWN',
	INITIALIZING: 'INITIALIZING',
	STARTING:'STARTING',
	START_FAILED: 'START_FAILED',
	LISTENING: 'LISTENING',
	CONNECTED:'CONNECTED',
	ERROR:'ERROR',
	SHUTTING_DOWN: 'SHUTTING_DOWN',
	SHUTDOWN:'SHUTDOWN',
	SHUTDOWN_FAILED:'SHUTDOWN_FAILED'
};
Object.freeze(STATUS);
/**
 * Basic Auth Middleware for swagger to prevent public access
 * @param {object} req req object
 * @param {object} res res object
 * @param {function} next callback method
 */
const swaggerBasicAuthMiddleware = function(req, res, next) {
	if(req.params.challenge !=='12345'){
		res.send({
			errorMsg: 'unauthorized access',
			erroCode: 401
		});
	} else {
		next();
	}
};
/**
 * @typedef ApiServerOptions
 * @type {object}
 * @property {array} services - An array of npm package names used to load Services.
 * @property {array} serviceLocations - An array of glob patterns used to lookup Services.
 * @property {array} middlewares - An array of npm package names used to load Middlewares.
 * @property {array} middlewareLocations - An array of glob patterns used to lookup Middlewares.
 * @property {array} injectables - An array of npm package names used to load Injectables.
 * @property {array} injectableLocations - An array of glob patterns used to lookup Injectables.
 */
class ApiServer extends EventEmitter{
	/**
	 * @param {ApiServerOptions} options - Optional settings for this ApiServer
	 */
	constructor(options={}){
		super();
		this._setStatus(this.STATUS_STATES.INITIALIZING);
		this._expressApp = Express();
		this._options = options;
		this._loadedMiddlewares = {};
		this._loadedServices = {};
		this._loadedInjectables = {};
		this._initialize();
		this._server = new http.createServer(this._expressApp);
	}
	/*************************************************************************************/
	/* START PRIVATE METHODS */
	/*************************************************************************************/
	_initialize(){
		// optionally setup cors api wide
		if(_.has(this._options,'cors')){
			let corsOptions = { origin: '*' };
			if(_.isPlainObject(this._options.cors)){
				corsOptions = this._options.cors;
			}
			this._expressApp.use(cors(corsOptions));
		}
		// setup helmet middleware : THIS WILL FORCE THE DOMAIN TO BE ON https:
		// FOR RUNNING AT http disbale hsts middleware
		//this._expressApp.use(helmet());
		//Load Middleware
		this._loadMiddlewares();
		//Load Services
		this._loadServices();
		//Setup routes
		this._setupRoutes();
		//Setup Error Handlers
		this._setupErrorHandlers();
	}

	_getPropertyCaseInsensitively(obj,propNameToFind){
		let result = Object.keys(obj).find((key)=>{
			if(key.toLowerCase() === propNameToFind.toLowerCase()){
				return true;
			}
		});
		return result;
	}
	_buildContextObject($context={}){
		let builtContext = {
			apiServer: this,
			log: Logger
		};
		Object.keys($context).forEach((contextName)=>{
			if(contextName.toLowerCase() !== 'apiserver'){
				let injectableNameFound = this._getPropertyCaseInsensitively(this._loadedInjectables,contextName);
				//If the injectable is NOT loaded
				if(!injectableNameFound) {
					// look it up as a service
					let serviceNameFound = this._getPropertyCaseInsensitively(this._loadedServices,contextName);
					if(!serviceNameFound) {
						let errorDetails = {
							errorCode: 'FailedToLoadInjectable',
							errorMsg: `Failed to load Injectable (${contextName}), make sure this is loaded. This may require changing the order in which the injectables are loaded.`,
							missingInjectableName: contextName
						};
						throw errorDetails;
					}
					else{
						builtContext[contextName] = this._loadedServices[serviceNameFound];
					}
				}
				else{
					builtContext[contextName] = this._loadedInjectables[injectableNameFound];
				}
			}
		});
		return builtContext;
	}
	_normalizeRoutePath(path){
		return path.replace(/\{(.+)\}/g,(match,cap1)=>{
			return `:${cap1}`;
		});
	}
	_setStatus(status){
		if(Object.prototype.hasOwnProperty.call( this.STATUS_STATES, status )){
			this._status = status;
		}
		else{
			throw new Error(`Unknown Status, cannot set the status of the pms to ${status}`);
		}
	}
	_setupOpenApiDefinition(router,apiLocations){
		let pkg = require('../package.json');
		let scopes = [];
		const options = {
			swaggerDefinition: {
				openapi: '3.0.1',
				info: {
					title: pkg.name,
					version: pkg.version,
					description: pkg.description
				},
				components: {
					securitySchemes: {
						openIdConnect: {
							// TODO currently open bug in swagger ui, this needs to be resolved in order to use swagger ui
							// https://github.com/swagger-api/swagger-ui/issues/3517
							type: 'openIdConnect',
							openIdConnectUrl: '/.well-known/openid-configuration'
						},
						// until the above is fixed we will add this workaround
						accessToken: {
							type: 'http',
							scheme: 'bearer'
						}
					}
				},
				security: [
					{ openIdConnect: scopes },
					{ accessToken: [] }
				],
				basePath: '/'
			},
			apis: apiLocations
		};
		// Initialize swagger-jsdoc which will returns validated swagger spec in json format
		this._openApiDefinition = swaggerJsDoc(options);
		//Setup Express OpenAPI Validator as a validation middleware based on OpenAPI document definition
		this._validator = new OpenApiValidator(this._openApiDefinition);
	}
	_locateClasses(globPatterns,npmPaths=[]){
		let foundClassPaths = [];
		//Locate classes by npm path
		npmPaths.forEach(classPath => {
			//get the fully resolved path to the service for use by swagger-jsdoc
			let pathToFile = require.resolve(classPath);
			//add the relative from CWD path
			foundClassPaths.push(pathUtils.relative(process.cwd(),pathToFile));
		});
		//Locate local classes by Glob patterns
		globPatterns.forEach(globPattern => {
			let found = glob.sync (globPattern, {});
			found.forEach(foundPath => {
				//add the relative from CWD path
				foundClassPaths.push(pathUtils.relative(process.cwd(),foundPath));
			});
		});
		return Array.from(new Set(foundClassPaths));
	}
	_loadClasses(classPaths,classMap={}){
		classPaths.forEach(pathToClass => {
			try{
				//create an instance of the Service
				let relativeFromHere = './' + pathUtils.relative(__dirname,pathUtils.join(process.cwd(),pathToClass));
				let Klass = require(relativeFromHere);
				let context = this._buildContextObject(Klass.$context);
				let instance = new Klass(context);
				//the Service's name is the name of the constructor
				let instanceName = instance.constructor.name;
				//keep a map of all the loaded services
				classMap[instanceName] = instance;
			}
			catch(e){
				log.error(`Encountered an error when attempting to load class (${pathToClass}).`);
				if(Object.prototype.hasOwnProperty.call( e, 'errorCode') && e.errorCode === 'FailedToLoadInjectable'){
					log.error(e.errorMsg);
				}
				else{
					log.error({error:e},'Error encountered ->');
				}
				throw e;
			}
		});
		return classMap;
	}
	_loadMiddlewares(){
		let globPatterns = [ __dirname+'/**/*.middleware.js' ];
		let npmPaths = [];
		if(this._options.middlewares){
			npmPaths = this._options.middlewares;
		}
		if(this._options.middlewareLocations){
			globPatterns = this._options.middlewareLocations;
		}
		let foundMiddlewareFilePaths = this._locateClasses(globPatterns,npmPaths);
		//Load each of the Middlewares
		this._loadedMiddlewares = this._loadClasses(foundMiddlewareFilePaths);
		//Load the seeded Middlewares
		this._loadedMiddlewares.STANDARD = {
			//Need to change allowed origins as per our env setup
			cors: (requestHelper,responseHelper)=>{
				return new Promise((resolve,reject)=>{
					try{
						(cors({ origin: '*' }))(requestHelper.rawRequest,responseHelper.rawResponse,()=>{
							resolve();
						});
					}
					catch(e){
						reject(e);
					}
				});
			},
			json: (requestHelper,responseHelper)=>{
				return new Promise((resolve,reject)=>{
					try{
						(Express.json())(requestHelper.rawRequest,responseHelper.rawResponse,()=>{
							(bodyParser.json())(requestHelper.rawRequest,responseHelper.rawResponse,()=>{
								resolve();
							});
						});
					}
					catch(e){
						reject(e);
					}
				});
			},
			url: (requestHelper,responseHelper)=>{
				return new Promise((resolve,reject)=>{
					try{
						(Express.urlencoded({ extended: false }))(requestHelper.rawRequest,responseHelper.rawResponse,()=>{
							(bodyParser.urlencoded({ extended: false }))(requestHelper.rawRequest,responseHelper.rawResponse,()=>{
								resolve();
							});
						});
					}
					catch(e){
						reject(e);
					}
				});
			},
			cookie: (requestHelper,responseHelper)=>{
				return new Promise((resolve,reject)=>{
					try{
						(cookieParser())(requestHelper.rawRequest,responseHelper.rawResponse,()=>{
							resolve();
						});
					}
					catch(e){
						reject(e);
					}
				});
			}
		};
	}
	_loadServices(){
		let globPatterns = [ __dirname+'/**/*.service.js' ];
		let npmPaths = [];
		if(this._options.services){
			npmPaths = this._options.services;
		}
		if(this._options.serviceLocations){
			globPatterns = this._options.serviceLocations;
		}
		let foundServiceFilePaths = this._locateClasses(globPatterns,npmPaths);
		//Setup the OpenAPI Definition
		this._setupOpenApiDefinition(this._router,foundServiceFilePaths);
		//Load each of the Services
		this._loadClasses(foundServiceFilePaths,this._loadedServices);
	}
	_setupRoutes(){
		this._router = Express.Router();
		// Serve OpenAPI 3.0 Definition
		this._expressApp.get('/swagger/:challenge/api-docs.json', swaggerBasicAuthMiddleware, (req, res) => {
			let responseHelper = new ResponseHelper(res);
			responseHelper.send(this._openApiDefinition);
		});
		//Render the Api Documentation
		this._router.use('/swagger/:challenge/api-docs',swaggerBasicAuthMiddleware,swaggerUi.serve,swaggerUi.setup(this._openApiDefinition,{
			explorer : true,
			swaggerOptions: {
				filter: true
			}
		}));
		//loop through all paths in the OpenAPI Definition and create routes for each service method
		Object.getOwnPropertyNames(this._openApiDefinition.paths).forEach((path)=>{
			let pathDefinition = this._openApiDefinition.paths[path];
			let normalizedPath = this._normalizeRoutePath(path);
			let route = this._router.route(normalizedPath);
			//loop through each method associated with a specific path
			Object.getOwnPropertyNames(pathDefinition).forEach((method)=>{
				let methodDefinition = pathDefinition[method];
				if(!Object.prototype.hasOwnProperty.call(methodDefinition,'serviceMethod')){
					throw new Error(`${method.toUpperCase()} ${path} was defined in the Open API Definition but did not specify a serviceMethod property under the method definition.`);
				}
				else{
					//lookup the serviceMethod in the loaded services
					if(!_.hasIn(this,`_loadedServices.${methodDefinition.serviceMethod}`)){
						throw new Error(`${method.toUpperCase()} ${path} was defined in the Open API Definition but we could not find a loaded serviceMethod using serviceMethod property ${methodDefinition.serviceMethod}.`);
					}
					else{
						let serviceMethodParts = methodDefinition.serviceMethod.split('.');
						if(serviceMethodParts.length !== 2){
							throw new Error(`${method.toUpperCase()} ${path} was defined in the Open API Definition but the serviceMethod property is not of the format <ServiceName>.<ServiceMethod> (${methodDefinition.serviceMethod}).`);
						}
						else{
							let serviceName = serviceMethodParts[0];
							let serviceMethod = serviceMethodParts[1];
							//load the route
							route[method](
								//Handle Custom Middleware via 
								(req, res, next) => {
									try {
										if (Object.prototype.hasOwnProperty.call(methodDefinition, 'serviceMiddlewares')) {
											let requestHelper = new MutableRequestHelper(req);
											let responseHelper = new ResponseHelper(res);
											let promChain = Promise.resolve();
											//loop through all the middlewares specified
											methodDefinition.serviceMiddlewares.forEach((middlewareName)=>{
												promChain = promChain
													.then(()=>{
														if(!_.hasIn(this,`_loadedMiddlewares.${middlewareName}`)){
															return Promise.reject(new Error(`${method.toUpperCase()} ${path} was defined in the Open API Definition but we could not find a loaded middleware using middleware property ${middlewareName}.`));
														}
													})
													.then(()=>{
														//get the middlewares class name and method name
														let serviceMiddlewareParts = middlewareName.split('.');
														if(serviceMiddlewareParts.length !== 2){
															return Promise.reject(new Error(`${method.toUpperCase()} ${path} was defined in the Open API Definition but the serviceMiddlewares property is not of the format <MiddlewareClassName>.<MiddlewareMethod> (${middlewareName}).`));
														}
														else{
															return serviceMiddlewareParts;
														}
													})
													.then((serviceMiddlewareParts)=>{
														let serviceMiddlewareClassName = serviceMiddlewareParts[0];
														let serviceMiddlewareMethodName = serviceMiddlewareParts[1];
														//If one of the middleware's didnt already handle the request, call the middleware
														if(!res.headersSent){
															return this._loadedMiddlewares[serviceMiddlewareClassName][serviceMiddlewareMethodName](requestHelper,responseHelper,methodDefinition);
														}
													})
													.catch((e)=>{
														log.error({error:e},`pms failed to execute middleware (${middlewareName}).`);
														//pass the error along.
														return Promise.reject(e);
													});
											});
											//After all middlewares have executed
											promChain
												.then(()=>{
													//If one of the middleware's didnt already handle the request, call the serviceMethod
													if(!res.headersSent){
														next();
													}
												})
												//if the middlewares rejected pass it along to the error handler
												.catch((e)=>{
													next(e);
												});
										} 
										//if no middlewares present call the serviceMethod
										else {
											next();
										}
									} 
									//if there is an unexpected error pass it to the error handler
									catch (error) {
										next(error);
									}
								},
								//validation middleware
								this._validator.validate(method,path),
								//Handle Request via the registered service method
								(req, res, next)=>{
									try{
										let requestHelper = new RequestHelper(req);
										let responseHelper = new ResponseHelper(res);
										//find method from path name
										Promise.resolve()
											.then(()=>{
												return this._loadedServices[serviceName][serviceMethod](requestHelper,responseHelper);
											})
											.then((response)=>{
												//if the method returned a value
												if(response){
													if(!Object.prototype.hasOwnProperty.call(response,'msg')){
														response.msg = `${requestHelper.method} request to ${requestHelper.path} succeeded.`;
													}
													if(!Object.prototype.hasOwnProperty.call(response,'status')){
														response.status = true;
													}
													responseHelper.ok(response);
												}
											})
											.catch(serviceMethodEncounteredErr =>{
												if (!res.headersSent) {
													responseHelper.badRequest(serviceMethodEncounteredErr);
												}
											});
									}
									catch(e){
										log.error({error:e},`pms failed to execute service method (${serviceMethod}).`);
										next(e);
									}
								}
							);
						}
					}
				}
			});
		});
		//wire up the router
		this._expressApp.use('/',this._router);
	}
	_setupErrorHandlers(){
		// catch 404
		this._expressApp.use((req, res, next)=> {//eslint-disable-line
			let responseHelper = new ResponseHelper(res);
			responseHelper.notFound();
		});
		// error handler
		this._expressApp.use((err, req, res, next)=>{//eslint-disable-line
			//delegate to the default Express error handler
			if (res.headersSent) {
				return next(err);
			}
			else {
				let requestHelper = new RequestHelper(req);
				let responseHelper = new ResponseHelper(res);
				let errorName = _.get(err,'constructor.name',undefined);
				switch (errorName){
				//Errors as reported by express-openapi-validate middleware
				case 'ValidationError':
					responseHelper.respondWithErrorDetails('ValidationError', err.message, {validationErrors: err.data, request: requestHelper, response: responseHelper},400);
					break;
				//Something went wrong that we did NOT expect send generic error
				default:
					//Providing requestHelper & responseHelper as additional 
					//props here will properly marshal more readable information for the client.
					responseHelper.respondWithError(err,{request: requestHelper, response: responseHelper},500);
					break;
				}
			}
		});
	}
	/*************************************************************************************/
	/* END PRIVATE METHODS */
	/* START PUBLIC API METHODS */
	/*************************************************************************************/
	get STATUS_STATES(){
		return STATUS;
	}
	getStatus(){
		return this._status;
	}
	start(){
		return Promise.resolve()
			//start listening on port 8080 and register all the common listeners
			.then(()=>{
				//Check if its already started
				switch(this.getStatus()){
				case this.STATUS_STATES.STARTING:
				case this.STATUS_STATES.CONNECTED:
					return this._startingProm;
				default:
					this._setStatus(this.STATUS_STATES.STARTING);
					this._startingProm = Promise.resolve()
						.then(()=>{
							return new Promise((resolve,reject)=>{
								this._server.listen(8080,(err)=>{
									if(err){
										this.shutdown(err)
											.then(()=>{
												reject(err);
											})
											.catch(reject);
									}
									else{
										resolve();
									}
								});
								this._server.on('error', this._onError = this._onError.bind(this));
								this._server.on('listening', this._onListening = this._onListening.bind(this));
							});
						})
						.then(()=>{
							this._setStatus(this.STATUS_STATES.CONNECTED);
						})
						.catch((e)=>{
							log.error({error:e},'pms failed to startup');
							this._setStatus(this.STATUS_STATES.START_FAILED);
							return Promise.reject(e);
						});
					return this._startingProm;
				}
			});
	}
	shutdown(err,exitCode=0){
		return Promise.resolve()
			.then(()=>{
				//Check if its already shutdown
				switch(this.getStatus()){
				case this.STATUS_STATES.START_FAILED:
				case this.STATUS_STATES.SHUTTING_DOWN:
				case this.STATUS_STATES.SHUTDOWN:
					return this._shuttingdownProm;
				default:
					this._setStatus(this.STATUS_STATES.SHUTTING_DOWN);
					if(err){
						log.error({error:err},'pms encountered a failure scenario and is being shutdown...');
					}
					this._shuttingdownProm = Promise.resolve()
						.then(()=>{
							this._server.removeListener('error', this._onError);
							this._server.removeListener('listening', this._onListening);
							return new Promise((resolve,reject)=>{
								this._server.close((err)=>{
									if(err){
										reject(err);
									}
									else{
										resolve();
									}
								});
							});
						})
						.catch((e)=>{
							log.error({error:e},'pms failed to shutdown, please make sure things do not need atttending...');
							this._setStatus(this.STATUS_STATES.SHUTDOWN_FAILED);
						})
						//FINALLY
						.then(()=>{
							log.info('pms exiting');
							if(!exitCode){
								if(err){
									this.emit('ShutdownComplete',1);
								}
								else{
									this.emit('ShutdownComplete',0);
								}
							}
							else{
								this.emit('ShutdownComplete',exitCode);
							}	
						});
					return this._shuttingdownProm;
				}
			});
	}
	fail(error){
		return this.shutdown(error,6);
	}
	/*************************************************************************************/
	/* END PUBLIC API METHODS */
	/* START HTTP SERVER HANDLER METHODS */
	/*************************************************************************************/
	_onError(error){
		this._setStatus(this.STATUS_STATES.ERROR);
		if (error && error.syscall === 'listen') {
			switch (error.code) {
			case 'EACCES':
				log.error('assignment on Address: requires elevated privileges.');
				this.shutdown(error,1);
				break;
			case 'EADDRINUSE':
				log.error('assignment on Address: cannot start port is already in use.');
				this.shutdown(error,1);
				break;
			default:
				log.error({error:error},'assignment internal http server encountered an error.');
				this.shutdown(error,1);
				throw error;
			}
		}
		else{
			throw error; //this will be caught by the uncaughtException handler see ../main.js
		}
	}
	_onListening(){
		const addressInfo = this._server.address();
		this._setStatus(this.STATUS_STATES.LISTENING);
		log.info(`assignment listening on Address: ${addressInfo.address} and port : ${addressInfo.port}`);
		dbUtils._insertAllData();
	}
	/*************************************************************************************/
	/* END HTTP SERVER HANDLER METHODS */
	/*************************************************************************************/
}
module.exports = ApiServer;