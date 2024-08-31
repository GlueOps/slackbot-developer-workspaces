import fs from 'fs';
import path from 'path';

const getFiles = (dir, folderOnly = false) => {
    const files = fs.readdirSync(dir, {
        withFileTypes: true,
    });

    let results = [];

    for (const file of files) {
        const fileName = path.join(dir, file.name);

        if (file.isDirectory()) {
            if (folderOnly) {
                results.push(fileName);
            } else {
                results = results.concat(getFiles(fileName));
            }
            continue
        }

        if (!folderOnly) results.push(fileName);
    }

    return results;
}

export default getFiles;