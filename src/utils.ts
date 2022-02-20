import { type } from 'os'
import { Fattura, Dettaglio, Committente, Prestatore, Imponibile, Imposta, Pagamento, DettPagam } from './interfaces'
import builder, { XMLElement } from 'xmlbuilder'
import fs from 'fs'
import axios, { AxiosRequestConfig } from 'axios'




export default async function main(inizio:number, fine:number, urlfatture:string, urlmovimenti:string, urlclienti:string, urlpaesi:string, urldettaglio:string, urlddt:string, urllistino:string, prestatore:Prestatore, ninoxToken:string) {


    let fatture: any = await get(urlfatture+`?sinceId=${inizio-1}&perPage=${fine-inizio+1}`, ninoxToken); //pesco le fatture richieste 


    for (let i = 0; i < (fatture['data']).length; i++) { // per ogni fattura
        let fattura: Fattura | undefined;
        try {
             fattura = fillFattura(fatture, i);  // riempire dati della fattura 

        
        
            if(fattura){
                
                let persona: Committente = await fillPersona(fatture, i, urlclienti, urlpaesi, ninoxToken );
                let dettaglio: Dettaglio[] = await fillDettaglio(fatture, i, urldettaglio, urllistino, urlddt, ninoxToken);
                
                let imponibile: Imponibile = getImponibile(dettaglio);
                let imposta: Imposta = getImposta(imponibile)
                let pagamento: Pagamento = await fillPagamento(fattura, urlmovimenti, ninoxToken)

                fattura.imponibilefattura = imponibile
                fattura.imposta = imposta
                fattura.totale = getTotale(imposta, imponibile);



                let xml = buildxml(fattura, dettaglio, persona, prestatore, pagamento, i );  
                
                //await saveFileOnBucket(xml, fattura.numero)
                await saveFileLocal(xml, fattura.numero)
                
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
    let imponibile: Imponibile = {zero:0, dieci:0, quattro: 0, ventidue: 0}
    let imposta: Imposta = {zero:0, dieci:0, quattro: 0, ventidue: 0}


    fattura = { tipodocumento: 'TD01', divisa: 'EUR', data: rawfatt['DATA FATT.'].trim() as string, 
                numero: rawfatt['nr fatt.'], causale: '', riferimentonumlinea: '', 
                iddocumento: '987657', numitem: '1', esigibilitaiva: 'D', imponibilefattura: imponibile,
                imposta: imposta, totale: '0', movimenti: rawfatt['MOVIMENTI MONETARI'], 
                condizioniPagamento: rawfatt['Condizioni pagamento fattura'], 
                modalitaPagamento: rawfatt['Modalità pagamamento fattura'] }


    if( fattura == undefined){
        console.log('fattura non definita')
    }else{
        console.log('fattura ', rawfatt['nr fatt.'])
    }

    return fattura
}

async function fillPersona( fatture: any, nFattura: number, urlclienti:string, urlpaesi:string, ninoxToken:string): Promise<Committente> {

    let idCliente: any = fatture['data'][nFattura]['fields']['anagr. CLIENTI'];
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

    // dati cliente
    const clienteRaw: any = await get(urlclienti +'/'+ idCliente, ninoxToken)
    const cliente = clienteRaw['data']['fields']

    console.log(cliente)

    denominazione = cliente['CLIENTE'].trim();
    cf = cliente['Cod. Fiscale']?.trim();
    piva = cliente['PARTITA IVA']; // priorita
    via = cliente['VIA'].trim()
    idpaese = cliente['ELENCO PAESI']
    sdi = cliente['CODICE SDI']
    pec = cliente['PEC']


    // se non ha la pec metto una stringa vuota 
    if(!pec)
        pec = ''
    
    if (!sdi)
        sdi = '0000000'

    // dati del paese 
    const paeseRaw : any = await get(urlpaesi +'/'+ idpaese, ninoxToken)
    const paese: any = paeseRaw['data']['fields']

    cap = paese['CAP']
    provincia = paese['PV']
    comune = paese['PAESE']


    committente = { denominazione: denominazione, codicefiscalecc: cf, indirizzocc: via, capcc: cap, provinciacc: provincia, comunecc: comune, nazionecc: nazione, piva: piva, sdi:sdi, pec:pec }
    
    if(committente){    
        console.log('committente ok ')
    }else{
        console.log('problemi con il committente')
    }

    return committente
}

async function fillDettaglio(fatture: any, nFattura: number, urldettaglio: string, urllistino:string, urlddt:string, ninoxToken:string): Promise<Dettaglio[]>{
   

    let dettaglio: Dettaglio[] = []; 

    let dettIds: number[]= fatture['data'][nFattura]['fields']['Dettaglio articoli DDT'] // gli id del dettaglio stanno nel dettaglio articoli ddt 

    if(dettIds.length == 0){
        console.log('non cè il dettaglio')
    }

    //const dettRaw: any = await get(urldettaglio+'?sinceId='+dettIds[0]+'perPage=1000') // prende da ninox il 
        

   // qui si aggiusta il centro di costo 
    if (fatture['data'][nFattura]['fields']['Dettaglio articoli DDT'] != undefined) {
        

        const promises = dettIds.map((el, i) => (
            new Promise<{ dettaglio: Dettaglio }>(async (res, rej) => {
                
                await new Promise((res) => setTimeout(res, i * 1000));

                const dettRaw: any = await get(urldettaglio+'/'+el, ninoxToken)
                const dett: any = dettRaw['data']
                let codiceIva = undefined
                let qta: number = 1



                if(dett['fields']['TIPO IVA DIV 4,10,22']){
                    codiceIva = dett['fields']['TIPO IVA DIV 4,10,22'].substring(0,4)
                }
                if(dett['fields']['Quantità']){
                    qta = (dett['fields']['Quantità']);
                }
                let prezzoun: number = await fillPrezzo(dett);
                let ivaArticolo = dett['fields']['IVA ARTICOLO']
                let desc = await fillDescrizione(dett, urllistino, urlddt, ninoxToken) as string
                
                
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
async function fillDescrizione(dett: any, urllistino:string, urlddt:string, ninoxToken: string): Promise<string> {
    let ddtID: any = dett['fields']['DDT']
    let dataddt: string = '';
    let codicearticolo: any = '';
    let descrizionearticolo: string = '';
    let descrizione: string = '';
    let nddt = ''
    const idArticolo = dett['fields']['Listino Articoli']

    let listinoRaw: any = await get(urllistino+'/'+idArticolo, ninoxToken);
    let articolo: any = listinoRaw['data']['fields']

    let ddtRaw: any = await get(urlddt+'/'+ddtID, ninoxToken);
    let ddt: any = ddtRaw['data']['fields']


    descrizionearticolo = articolo['Descrizione Articolo'].trim()
    codicearticolo = articolo['Codice articolo']
    nddt = ddt['DDT nr']
    dataddt = ddt['Data DDT'].trim()

    if (!codicearticolo) {
        codicearticolo = ''
    }

    descrizione = nddt + " " + dataddt + " " + codicearticolo + " " + descrizionearticolo
    return descrizione.trim()
}

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

    imponibile = dett['fields']['prezzo fattura']

    if(!imponibile){
        imponibile = 0
        console.log('prezzo non trovato:'+ dett['id'])
    }
    return imponibile
}
//ritorna imponibile sommando tutti i dettagli 
function getImponibile(dettaglio: Dettaglio[]): Imponibile {

    let imponibile: Imponibile = {zero:0, dieci:0, quattro: 0, ventidue: 0};

    dettaglio.forEach((dett: Dettaglio) => {
        
        if(dett.aliquotaiva == 22)
            imponibile.ventidue += dett.prezzototale
        else if(dett.aliquotaiva == 10)
            imponibile.dieci += dett.prezzototale
        else if(dett.aliquotaiva == 4)
            imponibile.quattro += dett.prezzototale
        else if(dett.aliquotaiva == 0)
            imponibile.zero += dett.prezzototale
        
    })
 
    
    return imponibile;
}

function getImposta( imponibile: Imponibile): Imposta{
    let imposta: Imposta = {zero:10, dieci:20, quattro: 30, ventidue: 40};

    imposta.zero = ((0.00 * imponibile.zero)/100)
    imposta.quattro = ((4.00 * imponibile.quattro)/100)
    imposta.dieci = ((10.00 * imponibile.dieci)/100)
    imposta.ventidue = ((22.00 * imponibile.ventidue)/100)


    return imposta
}

function getTotale(imposta: Imposta, imponibile: Imponibile): string{
    let totImponibile:number = imponibile.zero + imponibile.quattro+ imponibile.dieci + imponibile.ventidue;
    let totImposta: number = imposta.zero + imposta.quattro+ imposta.dieci + imposta.ventidue;

    return (totImposta + totImponibile).toFixed(2) + ''
}

// "condizioni pagamento 1" lo vado a prendere nella fattura invece che 
// "Modalità di pagamento" sempre dalla fattura 
export async function fillPagamento(fattura: Fattura, urlmovimenti:string, ninoxToken:string){

    let pagamento: Pagamento = {condizioni: '', dettaglio: [{ modalita: '', scadenza: '', importo: 0}] }
    if (fattura.movimenti && fattura.modalitaPagamento){


        const promises = fattura.movimenti.map((el) => (new Promise<{ dettaglio: DettPagam, condizioni: string }>(async (res, rej) => {
                const movimento: any = await get(urlmovimenti+'/'+el, ninoxToken)
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
                                .ele('CessionarioCommittente')
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
                                .ele('DatiGenerali')
                                    .ele('DatiGeneraliDocumento')
                                        .ele('TipoDocumento').text(fattura.tipodocumento).up()
                                        .ele('Divisa').text(fattura.divisa).up()
                                        .ele('Data').text(fattura.data).up()
                                        .ele('Numero').text(fattura.numero).up()
                                        .ele('ImportoTotaleDocumento').text((fattura.totale)).up().up().up()
                                       // .ele('Causale').text(fattura.causale).up().up()
                                //    .ele('DatiOrdineAcquisto') // che id devo metttere  qui ?!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                                  //      .ele('IdDocumento').text(fattura.iddocumento).up()
                                    //    .ele('NumItem').text(fattura.numitem).up().up().up()
                                .ele('DatiBeniServizi')
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
        if(fattura.imponibilefattura.ventidue != 0){
            xml = xml.ele('DatiRiepilogo')
                                .ele('AliquotaIVA').text('22.00').up()
                                .ele('ImponibileImporto').text(''+fattura.imponibilefattura.ventidue.toFixed(2)).up()
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
        if(fattura.imponibilefattura.zero != 0){
            xml = xml.ele('DatiRiepilogo')
                                .ele('AliquotaIVA').text('0.00').up()
                                .ele('ImponibileImporto').text(''+fattura.imponibilefattura.zero.toFixed(2)).up()
                                .ele('Imposta').text(''+fattura.imposta.zero.toFixed(2)).up().up()
        }    
            xml = xml.up()
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
        console.log('status',error.response.status)
        console.log(url)
        throw Error("problemi con la chiamata \n" + url+"\nprobabilmente il token o i parametri sono rotti")
    }
}