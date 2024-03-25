import FormData from 'form-data';
import axios, { AxiosRequestConfig } from 'axios'
import dotenv from 'dotenv'
import fs from 'fs'
import logger from 'euberlog';
const xml2js = require('xml2js');
dotenv.config()



const apiKey = process.env.FATTURA_PA_API_KEY

// url per le chiamate
const urlVerify = `https://api.fatturapa.com/ws/V10.svc/rest/verify/${apiKey}`; // Replace 'yourdomain.com' with the actual domain
const urluploadStart = `https://api.fatturapa.com/ws/V10.svc/rest/UploadStart/${apiKey}`;
let urluploadStop1 = `https://api.fatturapa.com/ws/V10.svc/rest/UploadStop1/${apiKey}/`; // c'è da aggiungere /name sotto 
let urluploadStop = `https://api.fatturapa.com/ws/V10.svc/rest/UploadStop/${apiKey}/`; // c'è da aggiungere /name sotto 

//load fattura da file e carica xml in buffer
//const fattXml =  fs.readFileSync('fatture/fattura36funziona.xml', 'utf8')


let uri = ''
let name = ''

export async function UploadStart() {
    let res = (await get(urluploadStart))
    uri = res.data.Complete
    name = res.data.Name
    logger.debug('upload start')


}



export async function uploadFileAPI( fattXml: string, inviaUpload: boolean = false) {


    const blob = Buffer.from(fattXml, 'utf-8');

    //console.log('blob', blob)
    //console.log('fattura', fattXml)


    const headers = {
        "x-ms-blob-type": "BlockBlob",
        "x-ms-version": "2017-11-09",
        "x-ms-date": new Date().toUTCString(),
        "x-ms-blob-content-type": "application/xml",
        "Content-Type": "application/xml",
        "Content-Length": Buffer.byteLength(fattXml).toString(), 
        };
    
    if (uri === '') {
        await UploadStart()
    }

    logger.debug('uri',uri)

    await axios.put(uri, blob, {
        headers: headers
    }).then((response) => {
        logger.debug('data',response.data);
        logger.info('file uploaded')
    }).catch((error) => {
        logger.error('error in upload stop')
        logger.error(error.message)
        logger.error('file not uploaded')
    });

    try {
        if (inviaUpload) {
            logger.debug('invia upload diretto ')
            await UploadStop()
        }else {
            logger.debug('invia upload stop1')
            await UploadStop1()
        }
        
    }
    catch (error : any) {
        logger.error('error in upload stop', error.message)
    }


}

// questa non invia la fattura all aagenzia delle entrate ma solo a fattura pa 
export async function UploadStop1() {
    if( name === '' ){
        logger.error('name non impostato')
        return
    }

    let res = (await get(urluploadStop1+name))
    logger.info('upload stop1')
    return res
}

//questa invia direttamente la fattura all'agenzia delle entrate
export async function UploadStop() {
    if( name === '' ){
        logger.error('name non impostato')
        return
    }

    let res = (await get(urluploadStop+name))
    logger.info('upload stop')
    return res
}


async function get(url: string):Promise<AxiosRequestConfig>{ 
    
    try {
        return await axios.get(url) as AxiosRequestConfig
    } catch (error:any) {
        console.log('error', error.response)
        if (error.response) {
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(error.response.data);
            const fault = result['Fault'];
            console.log('fault', fault.Code[0], fault.Reason[0].Text[0])
         }
        
        throw Error("problemi con la chiamata \n" + url)
    }
}




// const fattXml =  fs.readFileSync('fatture/fattura73funziona.xml', 'utf8')
// uploadFileAPI(fattXml)