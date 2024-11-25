// https://www.emqx.com/en/blog/mqtt-js-tutorial

let ovenTimeout;
let deferredPrompt;
let brokerConnected = false;
let ovenResponding = false;

const SECURE = true;
const INSTALLABLE = true;
const brokerUrl = SECURE ? 'wss://broker.emqx.io:8084/mqtt' : 'ws://broker.emqx.io:8083/mqtt';
const topic = 'iduxnet/epoxi2/temperature';
const clientId = 'hornoepoxi_web_' + Math.random().toString(16).slice(2);
const client = mqtt.connect(brokerUrl, { clientId: clientId, keepalive: 30 });

const installButton = document.getElementById('install-button');
const statusElement = document.getElementById('status');
const controlForm = document.getElementById('ovenControlForm');
const liveToastDiv = document.getElementById('liveToast');
const liveToast = bootstrap.Toast.getOrCreateInstance(liveToastDiv);
const setButton = document.getElementById('setButton');
const ctx = document.getElementById('temperatureChart').getContext('2d');

if ('serviceWorker' in navigator && INSTALLABLE) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/service-worker.js').then(
            function (registration) {
                console.log('Service Worker registered with scope:', registration.scope);
            },
            function (err) {
                console.log('Service Worker registration failed:', err);
            }
        );
    });
}

const checkIfInstalled = () => {
    const isIOSInstalled = window.navigator.standalone; // iOS
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches; // android, desktop

    if (isIOSInstalled || isStandalone) {
        if (installButton) installButton.style.display = 'none';
    } else {
        if (installButton) installButton.style.display = 'block';
    }
};

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;

    checkIfInstalled();

    const installButton = document.getElementById('install-button');
    if (installButton) {
        installButton.style.display = 'block';

        installButton.addEventListener('click', () => {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choice) => {
                if (choice.outcome === 'accepted') {
                    console.log('User accepted the install prompt');
                } else {
                    console.log('User dismissed the install prompt');
                }
                deferredPrompt = null;
                installButton.style.display = 'none'; // Hide after installation
            });
        });
    }
});

window.addEventListener("load", checkIfInstalled);

const temperatureChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Temperatura (°C)',
                data: [],
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
                tension: 0.1,
                fill: true,
            },
        ],
    },
    options: {
        responsive: true,
        scales: {
            x: {
                display: false,
            },
            y: {
                title: {
                    display: true,
                    text: 'Temperatura (°C)',
                },
                min: 0,
                max: 80,
            },
        },
    },
});

const updateStatusButton = () => {
    if (!brokerConnected) {
        statusElement.textContent = 'Conectando al broker';
        statusElement.className = 'btn btn-warning';
        setButton.disabled = true;
    } else if (!ovenResponding) {
        statusElement.textContent = 'Conectando al horno';
        statusElement.className = 'btn btn-info';
        setButton.disabled = true;
    } else {
        statusElement.textContent = 'Horno conectado';
        statusElement.className = 'btn btn-success';
        setButton.disabled = false;
    }
};

client.on('connect', () => {
    console.log('Conectado');

    brokerConnected = true;
    updateStatusButton();

    client.subscribe(topic, (err) => {
        if (err) return console.error('ERROR: ', err);
        console.log('Suscripto:', topic);
    });
});

client.on('message', (receivedTopic, message) => {
    if (receivedTopic === topic) {
        const payload = JSON.parse(message.toString());
        const temperature = parseFloat(payload.tem);

        document.getElementById('currentTemp').innerHTML = parseInt(temperature);
        document.getElementById('ovenState').innerHTML = `Estado ${payload.sta}`;
        document.getElementById('ovenTarget').innerHTML = `Setpoint ${payload.set}`;
        document.getElementById('ovenTimer').innerHTML = `Timer ${payload.dur}`;
        document.getElementById('ovenElapsed').innerHTML = `Restan ${payload.rem}`;
        document.getElementById('ovenPip').innerHTML = `P ${payload.p}`;
        document.getElementById('ovenPii').innerHTML = `I ${payload.i}`;
        document.getElementById('ovenPid').innerHTML = `D ${payload.d}`;

        document.getElementById('ovenState').style.color = payload.sta === 'OFF' ? '#32CD32' : '#FFCC00';

        const now = new Date().toLocaleTimeString();
        const data = temperatureChart.data;
        data.labels.push(now);
        data.datasets[0].data.push(temperature);
        if (data.labels.length > 20) {
            data.labels.shift();
            data.datasets[0].data.shift();
        }

        temperatureChart.update();

        clearTimeout(ovenTimeout);
        ovenResponding = true;
        updateStatusButton();

        ovenTimeout = setTimeout(() => {
            ovenResponding = false;
            updateStatusButton();
        }, 12000);
    }
});

client.on('error', (err) => {
    brokerConnected = false;
    updateStatusButton();

    console.error('MQTT error:', err);
});

client.on('offline', () => {
    brokerConnected = false;
    updateStatusButton();

    console.warn('MQTT offline');
});

client.on('reconnect', () => {
    brokerConnected = false;
    updateStatusButton();

    console.log('Reconectando...');
});

controlForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const command = document.getElementById('configOption').value;
    const value = document.getElementById('configValue').value;
    if (value !== '') {
        const payload = `${command}${value.toUpperCase()}`;

        client.publish('iduxnet/epoxi2/config', payload, (err) => {
            if (err) return console.error('ERROR al enviar config:', err);
            document.getElementById('liveToastBody').innerHTML = `Seteo enviado (${payload})`;
            liveToast.show();
            console.log(`Enviado ${payload}`);
        });
    }
});
