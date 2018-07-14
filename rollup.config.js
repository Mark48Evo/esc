import babel from 'rollup-plugin-babel';
import pkg from './package.json';

export default [
  {
    input: pkg.module,
    output: [
      {
        file: pkg.bin.esc,
        format: 'cjs',
        sourcemap: true,
        banner: '#!/usr/bin/env node',
      },
    ],
    external: [
      'debug',
      'amqplib',
      'serialport',
      'redis',
      '@mark48evo/vesc-protocol-generator',
      '@mark48evo/vesc-protocol-parser',
      '@mark48evo/vesc-packet-parser',
      '@mark48evo/usb-serialport-device-lister',
      '@mark48evo/system-events',
      '@mark48evo/system-state',
      '@mark48evo/system-esc',
    ],
    plugins: [
      babel({
        exclude: 'node_modules/**',
        envName: 'rollup',
      }),
    ],
  },
];
