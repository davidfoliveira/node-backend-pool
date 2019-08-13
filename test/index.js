var BackendPool = require('../index');

bp = new BackendPool({
    healthcheck: '/',
    removeAfter: 10,
    checkInterval: 1000,
});
bp.add('http://prozone.org');
bp.add('http://pz.org.pt');

bp.on('healthy', function(backend){
    console.log("H: ", backend.address);
});
bp.on('unhealthy', function(backend){
    console.log("U: ", backend.address);
});
bp.on('remove', function(backend){
    console.log("R: ", backend.address);
});