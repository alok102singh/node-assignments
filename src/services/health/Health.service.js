'use strict';
class Health {
	constructor(context){
		this._apiServer = context.apiServer;
	}
	/**
	 * @swagger
	 * /health-check:
	 *   get:
	 *     serviceMethod: Health.healthCheck
	 *     description: Check the current health of the application.
	 *     tags: [health-service]
	 *     responses:
	 *       200:
	 *         description: Server is alive, and here is the current application status.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               required:
	 *                 - status
	 *               properties:
	 *                 status:
	 *                   type: string
	 *                   enum:
	 *                     - INITIALIZING
	 *                     - UNKNOWN
	 *                     - STARTING
	 *                     - LISTENING
	 *                     - CONNECTED
	 *                     - ERRORD
	 */
	healthCheck(requestHelper,responseHelper){//eslint-disable-line
		return {
			status: this._apiServer.getStatus()
		};
	}
}
module.exports = Health;