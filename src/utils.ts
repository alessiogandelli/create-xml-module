import { type } from 'os'
import { Fattura, Dettaglio, Committente, Prestatore, Imponibile, Imposta, Pagamento, DettPagam } from './interfaces'
import builder, { XMLElement } from 'xmlbuilder'
import fs from 'fs'
import axios, { AxiosRequestConfig } from 'axios'
var lodash = require('lodash');
const {Storage} = require('@google-cloud/storage');
const storage = new Storage();



export default async function main(inizio:number, fine:number, urlfatture:string, urlmovimenti:string, urlclienti:string, urldettaglio:string,urllistino:string, prestatore:Prestatore, ninoxToken:string, local: boolean, GCLOUD_STORAGE_BUCKET: string) {

    console.log(`?sinceId=${inizio-1}&perPage=${fine-inizio+1}`)
    console.log('ertoken',ninoxToken)

    let fatture: any = await get(urlfatture+`?sinceId=${inizio-1}&perPage=${fine-inizio+1}`, ninoxToken); //pesco le fatture richieste 

    for (let i = 0; i < (fatture['data']).length; i++) { // per ogni fattura
        let fattura: Fattura | undefined;
        try {
             fattura = fillFattura(fatture, i);         // riempire dati della fattura 

        
        
            if(fattura){
                
                let persona: Committente = await fillPersona(fatture, i, urlclienti, ninoxToken );
                let dettaglio: Dettaglio[] = await fillDettaglio(fatture, i, urldettaglio, urllistino, ninoxToken);
                
                let imponibile: Imponibile = getImponibile(dettaglio);
                let imposta: Imposta = getImposta(imponibile)
                let pagamento: Pagamento = await fillPagamento(fattura, urlmovimenti, ninoxToken)

                fattura.imponibilefattura = imponibile
                fattura.imposta = imposta
                fattura.totale = getTotale(imposta, imponibile);



                let xml = buildxml(fattura, dettaglio, persona, prestatore, pagamento, i );  
                
                if (local) {
                    await saveFileLocal(xml, fattura.numero)
                } else {
                    await saveFileOnBucket(xml, fattura.numero, GCLOUD_STORAGE_BUCKET)

                }
                
            }      
        } catch (error) {
            console.log(error)
            console.log('proprio qui non va con fattura', inizio+i)
        }
    }  
    
}



function fillFattura(fatture: any, nFattura: number): Fattura | undefined {

    let rawfatt: any = fatture['data'][nFattura]['fields']
    let fattura: Fattura | undefined = undefined;
    let imponibile: Imponibile = {zero:{soldi:[], natura:[]}, dieci:0, quattro: 0, ventidue: {soldi:0, show:false}};
    let imposta: Imposta = {zero:0, dieci:0, quattro: 0, ventidue: 0}

    fattura = { tipodocumento: 'TD01', divisa: 'EUR', data: rawfatt['DATA FATT.'].trim() as string, 
                numero: rawfatt['nr fatt.'], causale: '', riferimentonumlinea: '', 
                iddocumento: '987657', numitem: '1', esigibilitaiva: 'D', imponibilefattura: imponibile,
                imposta: imposta, totale: '0', movimenti: rawfatt['MOVIMENTI MONETARI'], 
                condizioniPagamento: rawfatt['Condizioni pagamento fattura'], 
                modalitaPagamento: rawfatt['Modalità pagamento fattura'] }


    if( fattura == undefined){
        console.log('fattura non definita')
    }else{
        console.log('fattura ', rawfatt['nr fatt.'])
    }

    return fattura
}

async function fillPersona( fatture: any, nFattura: number, urlclienti:string, ninoxToken:string): Promise<Committente> {


   // let idCliente: any = fatture['data'][nFattura]['fields']['anagr. CLIENTI']; //raffelli 
    let idCliente: any = fatture['data'][nFattura]['fields']['Anagrafica CLIENTI']; // corima
    
    let denominazione: string = '';
    let cf: string = '';
    let piva: string = '';
    let via: string = '';
    let cap: string = '';
    let comune: string = '';
    let provincia: string = '';
    let nazione: string = 'IT';
    let idpaese: string = '';
    let sdi: string = '0000000';
    let pec: string = '';
    let committente: Committente;

    console.log(idCliente)

    // dati cliente
    //const clienteRaw: any = await get(urlclienti +'/'+ idCliente, ninoxToken)
    const clienteRaw: any = await get(urlclienti + `?sinceId=${idCliente-1}&perPage=1`, ninoxToken)
    const cliente = clienteRaw['data'][0]['fields']
    console.log(cliente)

    //denominazione = cliente['CLIENTE'].trim(); //raffelli
    denominazione = cliente['Denominazione'].trim(); //corima


    cf = cliente['Cod. Fiscale']?.trim();
    piva = cliente['PARTITA IVA']; // priorita
    via = cliente['VIA'].trim()
    idpaese = cliente['ELENCO PAESI']
    sdi = cliente['CODICE SDI']
    pec = cliente['PEC']
    provincia = cliente['PV']
    comune = cliente['PAESE']
    cap = cliente['CAP']

    // se non ha la pec metto una stringa vuota 
    if(!pec)
        pec = ''
    
    if (!sdi)
        sdi = '0000000'

    // dati del paese 
    // const paeseRaw : any = await get(urlpaesi +'/'+ idpaese, ninoxToken)
    // const paese: any = paeseRaw['data']['fields']

    // cap = paese['CAP']
    // provincia = paese['PV']
    // comune = paese['PAESE']


    committente = { denominazione: denominazione, codicefiscalecc: cf, indirizzocc: via, capcc: cap, provinciacc: provincia, comunecc: comune, nazionecc: nazione, piva: piva, sdi:sdi, pec:pec }
    
    if(committente){    
        console.log('committente ok ')
    }else{
        console.log('problemi con il committente')
    }

    return committente
}

async function fillDettaglio(fatture: any, nFattura: number, urldettaglio: string, urllistino:string, ninoxToken:string): Promise<Dettaglio[]>{
   

    let dettaglio: Dettaglio[] = []; 

    //let dettIds: number[]= fatture['data'][nFattura]['fields']['Dettaglio articoli DDT'] //raffelli  gli id del dettaglio stanno nel dettaglio articoli ddt 
    let dettIds: number[]= fatture['data'][nFattura]['fields']['dettaglio fattura'] // gli id del dettaglio stanno nel dettaglio articoli ddt 

    console.log('dettaglio ids' , dettIds)

    if(dettIds.length == 0){
        console.log('non cè il dettaglio')
    }

    //const dettRaw: any = await get(urldettaglio+'?sinceId='+dettIds[0]+'perPage=1000') // prende da ninox il 
        

   // qui si aggiusta il centro di costo 
    //if (fatture['data'][nFattura]['fields']['Dettaglio articoli DDT'] != undefined) { //raffelli
    if (fatture['data'][nFattura]['fields']['dettaglio fattura'] != undefined) {
        

        const promises = dettIds.map((el, i) => (
            new Promise<{ dettaglio: Dettaglio }>(async (res, rej) => {
                
                await new Promise((res) => setTimeout(res, i * 1000));

                const dettRaw: any = await get(urldettaglio+el, ninoxToken)
                const dett: any = dettRaw['data']
                let codiceIva = undefined
                let qta: number = 1
                let ivaArticolo = 0

//TODO magheggio per quando non c'è l'iva
                if (dett['fields']['IVA ARTICOLO']){
                     ivaArticolo = dett['fields']['IVA ARTICOLO']
                }else if(dett['fields']['TIPO IVA DIV 4,10,22']){
                    console.log('iva articolo non definita settata automaticamente a 0', el)
                }else{
                    ivaArticolo = 22
                }

                
                if(dett['fields']['TIPO IVA DIV 4,10,22']){
                    codiceIva = dett['fields']['TIPO IVA DIV 4,10,22'].substring(0,4)
                    if(codiceIva[2] == '-'){
                        console.log('il codice iva si èr totto percio ho tagliato')
                        codiceIva= codiceIva.substring(0,2)
                    }
                    console.log('codice iva ', codiceIva)
                    ivaArticolo = 0
                }
                if(dett['fields']['Quantità']){
                    qta = (dett['fields']['Quantità']);
                }
                let prezzoun: number = await fillPrezzo(dett);
             
                let desc = dett['fields']['descrizione']
                //let desc = await fillDescrizione(dett, urllistino, urlddt, ninoxToken) as string
                
                
                res({
                    dettaglio: { descrizione: desc, quantita: qta, prezzounitario: prezzoun, aliquotaiva: ivaArticolo, prezzototale: qta * prezzoun, codiceiva: codiceIva },                  
                });
        })));

        const res = await Promise.all(promises);
       
        dettaglio = res.map(x => x.dettaglio)
        
       
    } else {
        console.log('il dettaglio non è definito')
    }

    console.log('dettaglio')
    return dettaglio
}
// costuisce la descrizione per il dettaglio
// async function fillDescrizione(dett: any, urllistino:string, urlddt:string, ninoxToken: string): Promise<string> {
//     let ddtID: any = dett['fields']['DDT']
//     let dataddt: string = '';
//     let codicearticolo: any = '';
//     let descrizionearticolo: string = '';
//     let descrizione: string = '';
//     let nddt = ''
//     const idArticolo = dett['fields']['Listino Articoli']

//     let listinoRaw: any = await get(urllistino+'/'+idArticolo, ninoxToken);
//     let articolo: any = listinoRaw['data']['fields']

//     let ddtRaw: any = await get(urlddt+'/'+ddtID, ninoxToken);
//     let ddt: any = ddtRaw['data']['fields']


//     descrizionearticolo = articolo['Descrizione Articolo'].trim()
//     codicearticolo = articolo['Codice articolo']
//     nddt = ddt['DDT nr']
//     dataddt = ddt['Data DDT'].trim()

//     if (!codicearticolo) {
//         codicearticolo = ''
//     }

//     descrizione = nddt + " " + dataddt + " " + codicearticolo + " " + descrizionearticolo
//     return descrizione.trim()
// }

// ritorna il prezzo unitario dei vari elementi 
async function fillPrezzo(dett: any): Promise<number> {

    let imponibile: number = 0;
    // const idArticolo = dett['fields']['Listino Articoli']
    // let listinoRaw: any = await get(urllistino+'/'+idArticolo);
    // let articolo: any = listinoRaw['data']['fields']

    // const imponibileArticolo = articolo

    // if (imponibileArticolo) {
    //     imponibile = imponibileArticolo
    // } else {
    //     imponibile = 0;
    // }

    //imponibile = dett['fields']['prezzo fattura'] //raffelli
    imponibile = dett['fields']['importo']

    if(!imponibile){
        imponibile = 0
        console.log('prezzo non trovato:'+ dett['id'])
    }
    return imponibile
}
//ritorna imponibile sommando tutti i dettagli 
function getImponibile(dettaglio: Dettaglio[]): Imponibile {

    let imponibile: Imponibile = {zero:{soldi:[], natura :[]}, dieci:0, quattro: 0, ventidue: {soldi:0, show:false}};

    dettaglio.forEach((dett: Dettaglio) => {
        
        if(dett.aliquotaiva == 22){
            imponibile.ventidue.soldi += dett.prezzototale
            imponibile.ventidue.show = true
        }
        else if(dett.aliquotaiva == 10)
            imponibile.dieci += dett.prezzototale
        else if(dett.aliquotaiva == 4)
            imponibile.quattro += dett.prezzototale
        else if(dett.aliquotaiva == 0){
            imponibile.zero.soldi.push(dett.prezzototale)
            imponibile.zero.natura.push( dett.codiceiva)
        }
        else
            console.log('aliquota iva non riconosciuta', dett.aliquotaiva) 

        
    })
    console.log(imponibile)
 
    
    return imponibile;
}

function getImposta( imponibile: Imponibile): Imposta{
    let imposta: Imposta = {zero:10, dieci:20, quattro: 30, ventidue: 40};

    imposta.zero = ((0.00 * lodash.sum(imponibile.zero.soldi))/100)
    imposta.quattro = ((4.00 * imponibile.quattro)/100)
    imposta.dieci = ((10.00 * imponibile.dieci)/100)
    imposta.ventidue = ((22.00 * imponibile.ventidue.soldi)/100)


    return imposta
}

function getTotale(imposta: Imposta, imponibile: Imponibile): string{
    let totImponibile:number =lodash.sum(imponibile.zero.soldi) + imponibile.quattro + imponibile.dieci + imponibile.ventidue.soldi;
    let totImposta: number = imposta.zero + imposta.quattro+ imposta.dieci + imposta.ventidue;

    return (totImposta + totImponibile).toFixed(2) + ''
}

// "condizioni pagamento 1" lo vado a prendere nella fattura invece che 
// "Modalità di pagamento" sempre dalla fattura 
async function fillPagamento(fattura: Fattura, urlmovimenti:string, ninoxToken:string){

    let pagamento: Pagamento = {condizioni: '', dettaglio: [{ modalita: '', scadenza: '', importo: 0}] }


    if (fattura.movimenti && fattura.modalitaPagamento){


        const promises = fattura.movimenti.map((el) => (new Promise<{ dettaglio: DettPagam, condizioni: string }>(async (res, rej) => {
                const movimento: any = await get(urlmovimenti+el, ninoxToken)
                const mov: any = movimento.data.fields
                res({
                    dettaglio: { modalita: (fattura['modalitaPagamento'] as string).substring(0,4), scadenza: mov['DATA MOVIMENTO'] as string, importo:  mov['ENTRATA']},
                    condizioni: fattura['condizioniPagamento']
                });
        })));

        const res = await Promise.all(promises);


        pagamento = {
            condizioni: res[0].condizioni.substring(0,4),
            dettaglio: res.map(x => x.dettaglio)
        }
    }else{
        console.error('mancano i dettagli del pagamento')
    }

    console.log('pagamento')
    return pagamento
}



// return true if the first date is after  the second 
function isAfter(date1: string, date2: string) {

    let first: Array<number> = date1.split('-') as unknown as Array<number>
    let year1: number = first[0]
    let month1: number = first[1]
    let day1: number = first[2]

    let second: Array<number> = date2.split('-') as unknown as Array<number>
    let year2: number = second[0]
    let month2: number = second[1]
    let day2: number = second[2]

    let d1: Date = new Date() as Date;
    d1.setFullYear(year1, month1 - 1, day1)

    let d2: Date = new Date() as Date;
    d2.setFullYear(year2, month2 - 1, day2)

    return d1 > d2
}


async function saveFileLocal(xml:XMLElement, nFattura:string){
    fs.mkdirSync('fatture', { recursive: true })

    fs.writeFile('fatture/fattura'+ nFattura+'.xml', xml as unknown as string, function (err) {
        if (err) return console.log(err);
        console.log('scritto file '+ nFattura);
    });
}

function buildxml(fattura:Fattura, dettaglio:Dettaglio[], committente:Committente, prestatore:Prestatore,  pagamento: Pagamento, nFattura:number):XMLElement{
 


    let xml = builder.create('p:FatturaElettronica',{ encoding: 'UTF-8'})
                                                    .att('xmlns:p', 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2')
                                                    .att('versione', 'FPR12')
                            .ele('FatturaElettronicaHeader')
                                .ele('DatiTrasmissione')
                                    .ele('IdTrasmittente')
                                        .ele('IdPaese').text(prestatore.idPaese).up()
                                        .ele('IdCodice').text('NC').up().up()
                                    .ele('ProgressivoInvio').text(prestatore.progressivoInvio).up()
                                    .ele('FormatoTrasmissione').text(prestatore.formatotrasmissione).up()
                                    
                                    if (committente.pec){
                                        
                                        xml = xml.ele('CodiceDestinatario').text(committente.sdi).up()
                                        xml = xml.ele('PECDestinatario').text(committente.pec).up().up()
                                    }else{
                                        
                                        xml = xml.ele('CodiceDestinatario').text(committente.sdi).up().up()
                                    }
    //prestatore                                
                           xml = xml.ele('CedentePrestatore')
                                    .ele('DatiAnagrafici')
                                        .ele('IdFiscaleIVA')
                                            .ele('IdPaese').text(prestatore.idPaese).up()
                                            .ele('IdCodice').text(prestatore.idcodice).up().up()
                                        .ele('CodiceFiscale').text(prestatore.idcodice).up()
                                        .ele('Anagrafica')
                                            .ele('Denominazione').text(prestatore.denominazione).up().up()
                                        .ele('RegimeFiscale').text(prestatore.regimefiscale).up().up()
                                    .ele('Sede')
                                        .ele('Indirizzo').text(prestatore.indirizzocp).up()
                                        .ele('CAP').text(prestatore.capcp).up()
                                        .ele('Comune').text(prestatore.comunecp).up()
                                        .ele('Provincia').text(prestatore.provinciacp).up()
                                        .ele('Nazione').text(prestatore.nazionecp).up().up()
                                    .ele('IscrizioneREA')
                                        .ele('Ufficio').text(prestatore.ufficio).up()
                                        .ele('NumeroREA').text(prestatore.numeroREA).up()
                                        .ele('StatoLiquidazione').text(prestatore.statoliquidazione).up().up().up()
   /*committente*/              .ele('CessionarioCommittente')
                                    .ele('DatiAnagrafici')
                                        if(committente.piva != undefined){
                                             xml = xml.ele('IdFiscaleIVA')
                                                .ele('IdPaese').text(committente.nazionecc).up()
                                                .ele('IdCodice').text(committente.piva).up().up() 
                                        }else{
                                             xml = xml.ele('CodiceFiscale').text(committente.codicefiscalecc).up()
                                        }
                                        xml = xml.ele('Anagrafica')                                           
                                            .ele('Denominazione').text(committente.denominazione).up().up().up()
                                    .ele('Sede')
                                        .ele('Indirizzo').text(committente.indirizzocc).up()
                                        .ele('CAP').text((committente.capcc)).up()
                                        .ele('Comune').text(committente.comunecc).up()
                                        .ele('Provincia').text(committente.provinciacc).up()
                                        .ele('Nazione').text(committente.nazionecc).up().up().up().up()

                            .ele('FatturaElettronicaBody')
 /* dati generali     */        .ele('DatiGenerali')
                                    .ele('DatiGeneraliDocumento')
                                        .ele('TipoDocumento').text(fattura.tipodocumento).up()
                                        .ele('Divisa').text(fattura.divisa).up()
                                        .ele('Data').text(fattura.data).up()
                                        .ele('Numero').text(fattura.numero).up()
                                        .ele('ImportoTotaleDocumento').text((fattura.totale)).up().up().up()
       
 /*dettaglio */                 .ele('DatiBeniServizi')
                                    dettaglio.forEach((dett , i)=> {
                                        xml = xml.ele('DettaglioLinee')
                                                                .ele('NumeroLinea').text(i+1+"").up()
                                                                .ele('Descrizione').text(dett.descrizione).up()
                                                                .ele('Quantita').text(dett.quantita.toFixed(2)).up()
                                                                .ele('PrezzoUnitario').text(dett.prezzounitario.toFixed(2)).up()
                                                                .ele('PrezzoTotale').text(dett.prezzototale.toFixed(2)).up()
                                                                
                                        if(dett.codiceiva){
                                                    xml = xml.ele('AliquotaIVA').text(dett.aliquotaiva.toFixed(2)).up()
                                                                .ele('Natura').text(dett.codiceiva).up().up()
                                        }else{
                                                    xml = xml.ele('AliquotaIVA').text(dett.aliquotaiva.toFixed(2)).up().up()
                                        }
                                    });
 /* dati riepilogo */                                   
                                    if(fattura.imponibilefattura.ventidue.show){
                                        xml = xml.ele('DatiRiepilogo')
                                                            .ele('AliquotaIVA').text('22.00').up()
                                                            .ele('ImponibileImporto').text(''+fattura.imponibilefattura.ventidue.soldi.toFixed(2)).up()
                                                            .ele('Imposta').text(''+fattura.imposta.ventidue.toFixed(2)).up().up()
                                    }
                                    if(fattura.imponibilefattura.dieci != 0){              
                                        xml = xml.ele('DatiRiepilogo')
                                                            .ele('AliquotaIVA').text('10.00').up()
                                                            .ele('ImponibileImporto').text(''+fattura.imponibilefattura.dieci.toFixed(2)).up()
                                                            .ele('Imposta').text(''+fattura.imposta.dieci.toFixed(2)).up().up()
                                    }
                                    if(fattura.imponibilefattura.quattro != 0){
                                        xml = xml.ele('DatiRiepilogo')
                                                            .ele('AliquotaIVA').text('4.00').up()
                                                            .ele('ImponibileImporto').text(''+fattura.imponibilefattura.quattro.toFixed(2)).up()
                                                            .ele('Imposta').text(''+fattura.imposta.quattro.toFixed(2)).up().up()
                                    }
                                    if(fattura.imponibilefattura.zero.soldi[0] != 0){

                                        for(let i = 0 ; i < fattura.imponibilefattura.zero.soldi.length ; i++){
                                            xml = xml.ele('DatiRiepilogo')
                                                            .ele('AliquotaIVA').text('0.00').up()
                                                            .ele('Natura').text(fattura.imponibilefattura.zero.natura[i]).up()
                                                            .ele('ImponibileImporto').text(''+fattura.imponibilefattura.zero.soldi[i].toFixed(2)).up()
                                                            .ele('Imposta').text(''+fattura.imposta.zero.toFixed(2)).up().up()
                                        }
                                    }    
                                        xml = xml.up()


// pagamento  
            xml = xml.ele('DatiPagamento')
                        .ele('CondizioniPagamento').text(pagamento.condizioni).up()
                      
            pagamento.dettaglio.forEach(el =>{
                xml = xml.ele('DettaglioPagamento')
                    .ele('ModalitaPagamento').text(el.modalita).up()
                    .ele('DataScadenzaPagamento').text(el.scadenza.substring(0,10)).up()
                    

                    if(el.modalita == 'MP05'){
                        xml =  xml.ele('ImportoPagamento').text(el.importo.toFixed(2)).up()
                                  .ele('IBAN').text(prestatore.IBAN).up().up()
                    
                    }else{
                        xml =  xml.ele('ImportoPagamento').text(el.importo.toFixed(2)).up().up()

                    }

            })



            xml = xml.end({ pretty: true}) as unknown as XMLElement

           
        
    return xml;
}

async function get(url: string, ninoxToken: string):Promise<object>{ 
    
    try {
        return await axios.get(url, {headers:{Authorization: 'Bearer ' + ninoxToken}, 'Content-Type': 'application/json'} as AxiosRequestConfig);
    } catch (error) {
      //  console.log('status',error.response.status)
        console.log(url)
        throw Error("problemi con la chiamata \n" + url+"\nprobabilmente il token o i parametri sono rotti")
    }
}

async function saveFileOnBucket(xml:XMLElement, nFattura:string, GCLOUD_STORAGE_BUCKET:string) {

    const bucket = storage.bucket(GCLOUD_STORAGE_BUCKET);

    let fileName = bucket.file(`fattura-${nFattura}.xml`)
    
    await fileName.save(xml, function(err: any) {
    if (!err) {
        console.log(`Successfully uploaded ${fileName.name}`)
     }else{
         console.log(err)
     }});

}