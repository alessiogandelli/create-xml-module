import FormData from 'form-data';

import axios, { AxiosRequestConfig } from 'axios'
import dotenv from 'dotenv'
import fs from 'fs'
const xml2js = require('xml2js'); // You'll need to install xml2js if you haven't already

dotenv.config()

const apiKey = process.env.FATTURA_PA_API_KEY


const urlVerify = `https://api.fatturapa.com/ws/V10.svc/rest/verify/${apiKey}`; // Replace 'yourdomain.com' with the actual domain

const urluploadStart = `https://api.fatturapa.com/ws/V10.svc/rest/UploadStart/${apiKey}`;

//load fattura
const fattXml =  fs.readFileSync('fatture/fattura38.xml', 'utf8')
const blob = Buffer.from(fattXml, 'utf-8');
// const formData = new FormData()
// formData.append('file', blob, {
//     filename: 'fattura.xml',
//     contentType: 'application/xml',
//     knownLength: Buffer.byteLength(fattXml)
//   });

//console.log('data', formData)

console.log('xmlString', fattXml)

console.log('blob', blob)



async function uploadFile(uriupload: string) {

    let res = (await get(uriupload))
    let uri = res.data.Complete
    let name = res.data.Name
    console.log('uri',uri)
    
    // const blob = new Blob([fattXml], { type: 'application/xml' });
    // console.log('blob',blob)
    // console.log('blob',blob.size)
      
    //post file with axios 


    const headers = {
        "x-ms-blob-type": "BlockBlob",
        "x-ms-version": "2017-11-09",
        "x-ms-date": new Date().toUTCString(),
        "x-ms-blob-content-type": "application/xml",
        "Content-Type": "application/xml",
        "Content-Length": Buffer.byteLength(fattXml).toString(), 
        };


    //console.log('formData',formData.getHeaders())

    axios.put(uri, blob, {
        headers: headers
    }).then((response) => {
        console.log(response.data);
        console.log('file uploaded')
    }).catch((error) => {
        console.error(error);
        console.log('file not uploaded')
    });


    //upload stop
    const urluploadStop = `https://api.fatturapa.com/ws/V10.svc/rest/UploadStop1/${apiKey}/${name}`;
    console.log('urluploadStop', urluploadStop)
    let resStop = (await get(urluploadStop))

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




uploadFile(urluploadStart)