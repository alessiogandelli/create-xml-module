
import * as validator from 'xsd-schema-validator';
import { readFileSync } from 'fs';
import logger from 'euberlog';

export async function validatore(xml: string, numero: string, xsdPath: string = 'fatture/schema.xsd'): Promise<boolean> {
    try {
        const result = await validator.validateXML(xml, xsdPath);
        if (result.valid) {
            logger.info(`XML ${numero} is valid`);
            return true;
        } else {
            logger.error('XML is not valid');
            logger.error(result.result);
            return false;
        }
    } catch (error) {
        logger.error('Error occurred while validating XML');
        return false;
    }
}





const xmlPath = 'fatture/fatturaV00031.xml';
const xml = readFileSync(xmlPath, 'utf8')
const xsdPath = 'fatture/schema.xsd';

validatore(xml, '31', xsdPath);