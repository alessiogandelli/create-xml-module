# create_xml
node module that collect data from ninox and generate a xml according to the format provided by the Italian financial ministry 

this is an ad-hoc solution for a very specific problem probably won't fit to your use case 

usage:

the main function is used to run all the system that given a range of invoices stored on ninox creates the xml file and put them into a google cloud bucket 

inizio:number, 
fine:number, 

urlfatture:string, 
urlmovimenti:string, 
urlclienti:string, 
urlpaesi:string, 
urldettaglio:string, 
urlddt:string, 
urllistino:string, 

prestatore:Prestatore, 

ninoxToken:string, 
local: boolean,                 # save in a local folder instead of a bucket
GCLOUD_STORAGE_BUCKET: string

