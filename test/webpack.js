import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  //  mode: 'development',
  mode: 'production',
  target: 'web',
  devtool: false,
  entry: './test.js',
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'build/webpack'),
    //module: true,
    //  chunkFormat: 'module',
    chunkFormat: 'array-push',
  },
  experiments: {
    // outputModule: true,
  },
};
