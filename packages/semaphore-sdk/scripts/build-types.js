// Placeholder for TypeScript definitions
// In production, you'd generate these from TypeScript source or JSDoc
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');

// Create basic .d.ts files for now
// In production, use TypeScript compiler or JSDoc to generate proper types
function createTypeDefinitions(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      createTypeDefinitions(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.d.ts')) {
      // Create basic .d.ts file
      const dtsPath = entryPath.replace('.js', '.d.ts');
      const dtsContent = `// Type definitions for ${entry.name}\n// Generated automatically\n\nexport * from './${entry.name.replace('.js', '')}';\n`;
      fs.writeFileSync(dtsPath, dtsContent);
    }
  }
}

if (fs.existsSync(distDir)) {
  createTypeDefinitions(distDir);
  console.log('Type definitions generated');
} else {
  console.log('Dist directory not found. Run build:esm first.');
}

