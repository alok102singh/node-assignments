'use strict';
const bunyan = require('bunyan');
const path = require('path');
const appDir = path.dirname(require.main.filename);//eslint-disable-line
// create bunyan logger instance
const logger = bunyan.createLogger({
	name: 'data-services',
	streams: [
		{
			level: 'info',
			stream : process.stdout
		}
	]
});
// create child logger class and methods
class Logger{
	constructor( componentName ){
		this.componentName = componentName;
	}
	getChildLogger(){
		return logger.child({
			component: this.componentName
		});
	}
	static getInstance( loggerName ){
		if( !loggerName ){
			return logger;
		}
		else {
			return new Logger( loggerName ).getChildLogger();
		}
	}
}
module.exports = Logger;