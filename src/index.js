/* eslint-disable no-console */
import Debug from 'debug';
import amqplib from 'amqplib';
import SerialPort from 'serialport';
import { createClient } from 'redis';
import VescProtocolGenerator from '@mark48evo/vesc-protocol-generator';
import VescProtocolParser from '@mark48evo/vesc-protocol-parser';
import VescPacketParser from '@mark48evo/vesc-packet-parser';
import UsbSerialPortDeviceLister from '@mark48evo/usb-serialport-device-lister';
import SystemEvents from '@mark48evo/system-events';
import SystemState from '@mark48evo/system-state';
import SystemEsc from '@mark48evo/system-esc';

async function main() {
  const debug = Debug('esc');

  const config = {
    rabbitmqHost: process.env.RABBITMQ_HOST || 'amqp://localhost',
    redisURL: process.env.REDIS_URL || 'redis://127.0.0.1:6379/3',
  };

  const serialPortError = (err) => {
    console.error(`SerialPort Error: ${err}`);
  };

  const rabbitmqConnect = await amqplib.connect(config.rabbitmqHost);
  const rabbitmqChannel = await rabbitmqConnect.createChannel();
  const redis = createClient(config.redisURL);

  const systemEvents = await SystemEvents(rabbitmqChannel, { consume: false });
  const systemState = await SystemState(redis, rabbitmqChannel, { consume: false });
  const systemEsc = await SystemEsc(rabbitmqChannel, { consume: false });

  const usbListener = new UsbSerialPortDeviceLister({
    filters: [{
      vendorId: '0483',
      productId: '5740',
    }],
  });

  const vescProtocolParser = new VescProtocolParser();
  const vescPacketParser = new VescPacketParser();

  vescPacketParser.on('data', (packet) => {
    switch (packet.type) {
      case 'COMM_GET_VALUES':
        systemEsc.publish(
          'stats',
          {
            ...packet.payload,
            timestamp: Date.now(),
          },
        );
        break;

      default:
        debug(`Received unhandled packet type: "${packet.type}"`);
        break;
    }
  });

  vescProtocolParser.pipe(vescPacketParser);

  usbListener.on('attach', (device) => {
    debug(`ESC Device found at "${device.comName}"`);
    systemEvents.publish('esc.usb.connected', device);
    systemState.set('esc.usb.found', true);

    const serialPort = new SerialPort(device.comName, {
      baudRate: 921600,
      autoOpen: false,
    });

    serialPort.on('error', (err) => {
      serialPortError(err);
    });

    serialPort.open((err) => {
      if (err) {
        return serialPortError(err);
      }

      systemState.set('esc.usb.connected', true);

      serialPort.pipe(vescProtocolParser);

      return setInterval(() => {
        serialPort.write(VescProtocolGenerator(Buffer.from([0x04])));
      }, 100);
    });
  });

  usbListener.on('detach', (device) => {
    debug(`ESC Device disconnected at "${device.comName}"`);
    systemEvents.publish('esc.usb.disconnected', device);
  });

  usbListener.start();
}

main().catch(e => console.log(e));
