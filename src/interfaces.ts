
export interface Fattura{
    tipodocumento: string;
    divisa: string;
    data: string;
    numero: string;
    causale: string;
    riferimentonumlinea: string;
    iddocumento: string;
    numitem: string;
    imponibilefattura: Imponibile;
    esigibilitaiva: string;
    imposta:Imposta;
    totale:string;
    movimenti: number[];
    condizioniPagamento: string;
    modalitaPagamento: string;
}

export interface DettPagam{
    modalita: string;
    scadenza: string;
    importo: number;
}

export interface Pagamento{
    condizioni: string;
    dettaglio: Array<DettPagam>
}

export interface Committente{
    denominazione: string ;   // nel caso sia una società
    codicefiscalecc: string;
    piva:string;
    indirizzocc: string;
    numCivico: string;
    capcc: string;
    comunecc: string;
    provinciacc: string;
    nazionecc: string;
    sdi : string;
    pec: string;
}

export interface Prestatore{
    idPaese: string;
    idcodice: string;
    progressivoInvio: string;
    formatotrasmissione: string;
    codicedestinatario: string;
    denominazione: string;
    regimefiscale: string;
    indirizzocp : string;
    capcp: string;
    comunecp: string;
    provinciacp: string;
    nazionecp: string;
    ufficio: string;
    statoliquidazione: string;
    numeroREA: string;
    IBAN: string;  
}



export interface Dettaglio{
    descrizione: string;
    quantita: number;
    um: string;
    prezzounitario: number;
    prezzototale: number;
    aliquotaiva: number;
    codiceiva: string;
}

export interface Imponibile{
    zero: {soldi: number[], natura: string[]};
    quattro: number;
    dieci: number;
    ventidue: {soldi: number, show: boolean};
}

export interface Imposta{
    zero: number;
    quattro: number;
    dieci: number;
    ventidue: number;
}