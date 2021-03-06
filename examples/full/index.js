"use strict";

/**
 * This example uses all features of API Gateway:
 *  - SSL
 * 	- server assets
 *  - Multi routes
 *  - role-based authorization with JWT
 *  - whitelist
 *  - alias
 *  - body-parsers
 * 
 * Metrics, statistics, validation features of Moleculer is enabled.
 * 
 * Example:
 * 	
 *  - Open index.html
 * 		https://localhost:4000
 * 	
 *  - Access to assets
 * 		https://localhost:4000/images/logo.png
 * 	
 *  - API: Add two numbers (use alias name)
 * 		https://localhost:4000/api/add?a=25&b=13
 * 	
 *  - API: Divide two numbers with validation
 * 		https://localhost:4000/api/math/div?a=25&b=13
 * 		https://localhost:4000/api/math/div?a=25      <-- Throw validation error because `b` is missing
 * 
 *  - Authorization:
 * 		https://localhost:4000/api/admin/~node/health  <-- Throw `Unauthorized` because no `Authorization` header	
 * 
 * 		First you have to login . You will get a token and set it to the `Authorization` key in header
 * 			https://localhost:4000/api/login?username=admin&password=admin
 * 
 * 		Set the token to header and try again
 * 			https://localhost:4000/api/admin/~node/health
 * 
 */

let fs	 				= require("fs");
let path 				= require("path");
let { ServiceBroker } 	= require("moleculer");
let { CustomError } 	= require("moleculer").Errors;
let ApiGatewayService 	= require("../../index");

// Create broker
let broker = new ServiceBroker({
	logger: console,
	metrics: true,
	statistics: true,
	validation: true
});

// Load other services
broker.loadServices(path.join(__dirname, ".."), "*.service.js");

// Load metrics example service from Moleculer
//broker.createService(require("moleculer/examples/metrics.service.js")());

// Load API Gateway
broker.createService(ApiGatewayService, {
	settings: {

		// Exposed port
		port: 4000,

		// Exposed IP
		ip: "0.0.0.0",

		// HTTPS server with certificate
		https: {
			key: fs.readFileSync(path.join(__dirname, "../ssl/key.pem")),
			cert: fs.readFileSync(path.join(__dirname, "../ssl/cert.pem"))
		},

		// Exposed path prefix
		path: "/api",

		routes: [

			/**
			 * This route demonstrates a protected `/api/admin` path to access `users.*` & internal actions. 
			 * To access them, you need to login first & use the received token in header
			 */
			{
				// Path prefix to this route
				path: "/admin",

				// Whitelist of actions (array of string mask or regex)
				whitelist: [
					"users.*",
					"$node.*"
				],

				authorization: true,

				roles: ["admin"],

				// Action aliases
				aliases: {
					"POST users": "users.create",
					"health": "$node.health"
				},

				// Use bodyparser module
				bodyParsers: {
					json: true
				}
			},

			/**
			 * This route demonstrates a public `/api` path to access `posts`, `file` and `math` actions.
			 */
			{
				// Path prefix to this route
				path: "/",

				// Whitelist of actions (array of string mask or regex)
				whitelist: [
					"auth.*",
					"file.*",
					"test.*",
					/^math\.\w+$/
				],

				authorization: false,

				// Action aliases
				aliases: {
					"login": "auth.login",
					"add": "math.add",
					"GET sub": "math.sub",
					"POST divide": "math.div",
				},

				// Use bodyparser module
				bodyParsers: {
					json: true,
					urlencoded: { extended: true }
				}

			}
		],

		// Folder to server assets (static files)
		assets: {
			// Root folder of assets
			folder: "./examples/www/assets",
			// Options to `server-static` module
			options: {}
		}

	},

	methods: {
		/**
		 * Authorize the request
		 * 
		 * @param {Context} ctx 
		 * @param {Object} route
		 * @param {IncomingRequest} req 
		 * @returns {Promise}
		 */
		authorize(ctx, route, req) {
			let authValue = req.headers["authorization"];
			if (authValue && authValue.startsWith("Bearer ")) {
				let token = authValue.slice(7);

				// Verify JWT token
				return ctx.call("auth.verifyToken", { token }).then(decoded => {
					//console.log("decoded data", decoded);

					// Check the user role
					if (route.opts.roles.indexOf(decoded.role) === -1)
						return Promise.reject(new CustomError("Forbidden!", 403));

					// If authorization was succes, we set the user entity to ctx.meta
					return ctx.call("auth.getUserByID", { id: decoded.id }).then(user => {
						ctx.meta.user = user;
						this.logger.info("Logged in user", user);
					});
				})

				.catch(err => {
					if (err instanceof CustomError)
						return Promise.reject(err);

					return Promise.reject(new CustomError("Unauthorized! Invalid token", 401));
				});

			} else
				return Promise.reject(new CustomError("Unauthorized! Missing token", 401));
		}
	}
});

// Start server
broker.start();
