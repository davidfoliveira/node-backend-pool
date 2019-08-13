# backend-pool

A module to keep an updated list of healthy backends. It ensures background healthchecking according to the defined options and support great customization.

## How to use

	const BackendPool = require('backend-pool');
	
	const pool = new BackendPool({
	  healthcheck:   '/health',     // default healthcheck path
	  healthyAfter:      3,         // successful responses
	  unhealthyAfter:    2,         // unsuccessful response
	  removeAfter:      10,         // unsuccessful reponses
	  checkInterval:  5000,         // ms
	  checkTimeout:   1000,         // ms
	  isHealthy:      (res, cb) => { cb(true|false) },
	});
	pool.add('http://whatever.net');
	pool.add({ address: 'http://xpto.etc', unhealthyAfter: 1, checkInterval: 20000 });
	setInterval(() => console.log(pool.getHealthyAddresses()), 10000);


## Supported options

All options can be passed to the constructor as defaults and can also be passed to the `.add({...})` method if they are backend-specific settings.

- `healthcheckPath`: The healthcheck path to be used. Mandatory to be defined at construction time or as `.add()` option;
- `healthyAfter`: The number of consecutive successful responses to consider a backend as 'healthy'; (default: 3);
- `unhealthyAfter`: The number of consecutive unsuccessful responses to consider a backend as 'unhealthy'; (default: 1);
- `removeAfter`: The number of consecutive unsuccessful responses to remove a backend from the pool; A value of `undefined` or `null` means backends are never removed; (default: `undefined`);
- `checkInterval`: The time (in ms) between health checks; (default: 10000);
- `checkTimeout`: The maximum time to wait for a healthcheck endpoint to answer; (default: 1000);
- `isHealthy`: A function which decides if a response represents a healthy state; The function arguments are `(httpResponse, callback)`; If you need the response data, you'll need to read it from the stream; (default: 200 status code).


## Events

Both the backend pool and the individual backend objects (returned by `.add()` and `.get*()`) emit events.

- `healthy`: Notifies when a backend was considered healthy;
- `unhealthy`: Notifies when a backend was considered unhealthy;
- `removed`: Notified when a backend is going to be removed.


## Methods

A backend pool object supports the following methods:

- `get(address)`: Returns a backend object for a backend with a specific address or `null` in case a backend isn't found;
- `getHealthy()`: Returns a list of backend objects for the backends in healthy state;
- `getByState(state)`: Returns a list of backend objects for the backends in a specific state;
- `getHealthyAddresses()`: Returns a list of backend addresses for the backends in healthy state;
- `add(address|options)`: Adds a backend to the pool (in `NEW` state) by its address (URL) or object containing all the backend-specific options (and an `address` extra options)`; Supports all options defined defined above for the constructor;
- `remove(address|backendObject)`: Removes a backend from the pool;

