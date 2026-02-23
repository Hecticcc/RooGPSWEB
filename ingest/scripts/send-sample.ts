import net from 'net';

const host = process.env.INGEST_HOST ?? '127.0.0.1';
const port = parseInt(process.env.INGEST_PORT ?? '8011', 10);

const sample = '&&123456789012345,240223123456,A,2234.5678,N,11345.1234,E,25.5,180,0\r\n';

const client = net.createConnection(port, host, () => {
  client.write(sample);
  client.end();
});
client.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
