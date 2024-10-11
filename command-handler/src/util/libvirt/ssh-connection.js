import { Client } from 'ssh2';
import 'dotenv/config'

export default function executeSSHCommand(node, command) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on('ready', () => {
        console.log(`Connected to ${node.host}`);
        conn.exec(command, (err, stream) => {
          if (err) {
            reject(err);
            return;
          }
          let output = '';
          stream.on('close', (code, signal) => {
            conn.end();
            if (code !== 0) {
              reject(new Error(`Command failed with code ${code} and signal ${signal}`));
            } else {
              resolve(output);
            }
          }).on('data', (data) => {
            output += data; // Collect command output
          }).stderr.on('data', (data) => {
            reject(new Error(`Error: ${data}`));
          });
        });
      }).connect({
        host: node.host,
        username: node.username,
        privateKey: process.env.SSH_KEY
      });
    });
}