'use strict';
const _ = require('lodash');
const dbUtils = require('../../utils/utils')
const sqlite3 = require('sqlite3').verbose();

/**
 * @swagger
 * components:
 *   schemas:
 *     SuccessfulResponse:
 *       type: object
 *       required:
 *         - msg
 *         - status
 *       properties:
 *         msg:
 *           description: A success res message to be used by the client.
 *           type: string
 *         status:
 *           description: A boolean value with response data status.
 *           type: boolean
 *           enum: [true]
 *
 *     GenericError:
 *       type: object
 *       required:
 *         - errorCode
 *         - errorMsg
 *       properties:
 *         errorCode:
 *           description: 'A string the quickly identifies the error.'
 *           type: string
 *         errorMsg:
 *           description: 'A message that further identifies the error.'
 *           type: string
 *         errorDetails:
 *           description: 'Additional information that can help troubleshoot the error.'
 *           type: object
 */
class InsertData {
	constructor(context) {
		this._apiServer = context.apiServer;
		this._log = context.log.getInstance('INSERT-SERVICE');
	}

	/**
	 * @swagger
	 * /data:
	 *  post:
	 *     serviceMethod: InsertData.createNewData
	 *     serviceMiddlewares:
	 *       - STANDARD.json
	 *     security:
	 *       - openIdConnect:
	 *         - create:data
	 *     description: Create a new data in the database or system.
	 *     tags: [data-services]
	 *     requestBody:
	 *       description:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *     responses:
	 *       200:
	 *         description: New data has been created successfully.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessfulResponse'
	 *       400:
	 *         description: New data url has been failed, due to bad or invalid request.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/GenericError'
	 *       401:
	 *         description: New data url has been failed, due to missing/incorrect authorization.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/GenericError'
	 *       403:
	 *         description: New data url has been failed, due to insufficient authentication.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/GenericError'
	 */
	createNewData(requestHelper, responseHelper) {//eslint-disable-line
		let reqBody = requestHelper.getPayload();
		this._log.info('insertedData:Received request for creating new data ', reqBody);
		let responseData = {status: false, msg: '', data: []};
		return Promise.resolve()
			.then(() => {
				return Promise.all([dbUtils._insertAllData()]);
			})
			.then(() => {
				responseData.status = true;
				responseData.msg = 'All Data has been Inserted.';
				responseData.data = {};
				return responseData;
			})
			.catch((error) => {
				this._log.error('failed to create new data with error', error);
				return Promise.reject(error);
			});
	}

	/**
	 * @swagger
	 * /data:
	 *  get:
	 *     serviceMethod: InsertData.fetchInsertData
	 *     serviceMiddlewares:
	 *       - STANDARD.json
	 *     security:
	 *       - openIdConnect:
	 *         - read:data
	 *     description: Fetch all the list of categories in the system
	 *     tags: [data-services]
	 *     parameters:
	 *       - name: page
	 *         in: query
	 *         description: page listing
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: InsertData has been fetched successfully.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuccessfulResponse'
	 *       400:
	 *         description: File fetch has been Failed, due to invalid or bad request.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/GenericError'
	 *       401:
	 *         description: Data fetch has been Failed, due to missing/incorrect authentication.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/GenericError'
	 *       403:
	 *         description: Data fetch has been Failed, due to insufficient authorization.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/GenericError'
	 */
	async fetchInsertData(requestHelper, responseHelper) {//eslint-disable-line
		let reqParams = requestHelper.getQueryParams();
		this._log.info('Received request for fetching data url', reqParams);
		let responseData = {status: false, msg: '', data: []};
		return Promise.resolve()
			.then(()=>{
				return dbUtils._getAllData(reqParams.page)
			})
			.catch((error) => {
				return Promise.reject(error);
			});
	}
}

module.exports = InsertData;


