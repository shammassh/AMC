// Uninstall AMC Windows Service
const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
    name: 'AMC-UAT',
    script: path.join(__dirname, '..', 'app.js')
});

svc.on('uninstall', function() {
    console.log('Service uninstalled successfully!');
});

svc.on('error', function(err) {
    console.error('Service error:', err);
});

console.log('Uninstalling AMC-UAT Windows Service...');
svc.uninstall();
