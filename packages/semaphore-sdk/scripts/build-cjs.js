import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');

// Simple CJS wrapper - just add .cjs extension copies
// In production, you'd use a proper bundler
function createCJSFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      createCJSFiles(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.cjs')) {
      // Read ESM file
      let content = fs.readFileSync(entryPath, 'utf8');
      
      // Create CJS version
      const cjsPath = entryPath.replace('.js', '.cjs');
      
      // For now, just copy - in production use a proper ESM to CJS converter
      // This is a placeholder - you'd want to use @rollup/plugin-commonjs or similar
      fs.writeFileSync(cjsPath, content);
    }
  }
}

if (fs.existsSync(distDir)) {
  createCJSFiles(distDir);
  console.log('CJS build complete');
} else {
  console.log('Dist directory not found. Run build:esm first.');
}

