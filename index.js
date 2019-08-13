var
  url          = require('url'),
  EventEmitter = require('events');
  clients      = {
    http:        require('http'),
    https:       require('https'),
  };


function BackendPool(opts) {
  var self = this;
  if (!opts) opts = {};

  // Backend list
  this.all = [ ];
  this.byAddress = { };

  // Parse options
  this.opts = {
    healthcheck:      opts.healthcheck    || null,
    healthyAfter:     opts.healthyAfter   || 3,
    unhealthyAfter:   opts.unhealthyAfter || 1,
    removeAfter:      opts.removeAfter    || undefined,
    checkInterval:    opts.checkInterval  || 10000,
    checkTimeout:     opts.checkTimeout   || 1000,
    isHealthy:        opts.isHealthy      || function(res, cb) { cb(res.statusCode === 200); },
  };

  // Events
  this._events = new EventEmitter();
  this.on = function(ev, cb) {
    self._events.on(ev, cb);
  };
  this.emit = function(ev, args) {
    self._events.emit(ev, args);
  };

  return this;
}

/*
 * Functions
 */

// Get the healthy backends
BackendPool.prototype.getHealthy = function() {
  return this.getByState('HEALTHY');
};

// Get the healthy backends
BackendPool.prototype.getHealthyAddresses = function() {
  var
    backends = this.getByState('HEALTHY'),
    addresses = [];

  backends.forEach(function(backend) {
    addresses.push(backend.originalAddress);
  });

  return addresses;
};

// Get backends by state
BackendPool.prototype.getByState = function(state) {
  var
    self = this,
    healthy = [];

  self.all.forEach(function(backend){
    if (backend.state === state.toUpperCase())
      healthy.push(backend);
  });

  return healthy;
};

// Check a single backend health state
BackendPool.prototype._checkBackend = function(backend) {
  var self = this;

  if (backend._checking) return;
  backend._checking = true;

  // Request the healthcheck
  self._requestBackend(backend);

  // Schedule the next update
  backend._timeout = setTimeout(function(){
    self._checkBackend(backend);
  }, backend.checkInterval);
}

// Send a healthcheck request to a backend
BackendPool.prototype._requestBackend = function(backend) {
  var
    self = this,
    report = function(healthy) {
      if (!backend._checking) return;
      backend._checking = false;
      self._updateBackend(backend, healthy);
    };

  // Set a timeout for this
  var timeout = setTimeout(function(){
    report(false);
  }, backend.checkTimeout);

  // Send the request
  var client = clients[backend.healthcheck.protocol.replace(/:/, '')];
  var req = client.request(backend.healthcheck, function(res) {
    backend.isHealthy(res, function(isHealthy) {
      report(isHealthy);
    });
  });
  req.on('error', function(err){
    report(false);
  });
  if (backend.healthcheck.data != null)
    res.write(backend.healthcheck.data);
  req.end();
};

// Update a backend with a healthcheck status
BackendPool.prototype._updateBackend = function(backend, isHealthy) {
  var self = this;

  if (isHealthy) {
    // If it's healthy, reset failed
    backend._numFailed = 0;

    // If backend still not healthy
    if (backend.state !== 'HEALTHY') {
      backend._numPassed++;
      if (backend._numPassed === backend.healthyAfter) {
        self._markBackend(backend, 'HEALTHY');
      }
    }
  }
  else {
    // If it's failed, reset the number of passed healthchecks
    backend._numPassed = 0;

    // Count the number of failures "forever" because we need to remove it
    backend._numFailed++;

    // If it's healthy and the number of failed is hitting the "unhealthy" mark, set backend as unhealthy
    if (backend.state == 'HEALTHY' && backend._numFailed === backend.unhealthyAfter) {
      self._markBackend(backend, 'UNHEALTHY');
    }

    // If it's healthy and the number of failed is hitting the "unhealthy" mark, set backend as unhealthy
    if (backend.removeAfter != null && backend._numFailed === backend.removeAfter) {
      self._removeBackend(backend);
    }
  }
};

// Mark a backend with a state
BackendPool.prototype._markBackend = function(backend, state) {
  var lcState = state.toLowerCase();
  backend.state = state;
  backend.emit(lcState);
  this.emit(lcState, backend);
};

// Remove backend from the list
BackendPool.prototype._removeBackend = function(backend) {
  clearTimeout(backend._timeout);
  delete this.byAddress[backend.originalAddress];

  // Remove from the list of all backends
  // TODO: we can speed this up if we keep a hash of the index number in the list
  for (var x = 0; x < this.all.length; x++) {
    if (this.all[x] == backend) {
      this.all.splice(x, 1);
      backend.emit('remove');
      this.emit('remove', backend);
      return true;
    }
  }
  return false;
};

// Get a backend by address
BackendPool.prototype.get = function(address) {
  return this.byAddress[address];
};

// Add a new backend
BackendPool.prototype.add = function(address) {
  var
    self = this;

  if (self.byAddress[address])
    return null;

  var
    backend = (typeof(address) == 'object') ? address : { address: address };

  // Some basics
  backend.state = 'NEW';
  backend._numPassed = 0;
  backend._numFailed = 0;

  // Events
  backend._events = new EventEmitter();
  backend.on = function(ev, cb) {
    backend._events.on(ev, cb);
  };
  backend.emit = function(ev, args) {
    backend._events.emit(ev, args);
  };

  // Check the address
  if (!backend.address.match(/^https?:\/\//)) {
    backend.address = "http://" + backend.address;
  }
  backend.address = url.parse(backend.address);
  backend.originalAddress = address;

  // Check the healthcheck
  if (!backend.healthcheck) {
    if (this.opts.healthcheck) {
      backend.healthcheck = this.opts.healthcheck;
    }
    else {
      throw new Error("Please specify a 'healthcheck' option at construction time or as add() option");
    }
  }
  backend.healthcheck = url.parse(url.resolve(backend.address, backend.healthcheck));
  if (!backend.healthcheck.headers)
    backend.healthcheck.headers = {};
  if (!backend.healthcheck.headers.host)
    backend.healthcheck.headers.host = backend.healthcheck.host;

  // Apply defaults
  ['healthyAfter', 'unhealthyAfter', 'removeAfter', 'checkInterval', 'checkTimeout'].forEach(function(prop) {
    if (!backend[prop])
      backend[prop] = parseInt(self.opts[prop]);
  });
  ['isHealthy'].forEach(function(prop){
    if (!backend[prop])
      backend[prop] = self.opts[prop];
  });

  // Add to the list of backends
  this.all.push(backend);
  this.byAddress[address] = backend;

  // Schedule the update
  setTimeout(function(){
    self._checkBackend(backend);
  }, backend.checkInterval);

  return backend;
};

// Remove a backend
BackendPool.prototype.remove = function(address) {
  if (typeof(address) === 'object')
    address = address.originalAddress;

  var backend = this.byAddress[address];
  if (!backend)
    return false;

  this._removeBackend(backend);

  return backend;
};


module.exports = BackendPool;
