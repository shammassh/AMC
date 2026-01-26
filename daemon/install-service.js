// Install AMC as Windows Service
const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
    name: 'AMC-UAT',
    description: 'Area Manager Checklist UAT Application',
    script: path.join(__dirname, '..', 'app.js'),
    nodeOptions: ['--harmony'],
    env: [{
        name: 'NODE_ENV',
        value: 'production'
    }],
    workingDirectory: path.join(__dirname, '..')
});

// Listen for the "install" event, which indicates the service is installed
svc.on('install', function() {
    console.log('Service installed successfully!');
    console.log('Starting service...');
    svc.start();
});

svc.on('start', function() {
    console.log('Service started!');
    console.log('The AMC app is now running as a Windows Service on port 6060');
});

svc.on('error', function(err) {
    console.error('Service error:', err);
});

// Install the service
console.log('Installing AMC-UAT Windows Service...');
svc.install();
