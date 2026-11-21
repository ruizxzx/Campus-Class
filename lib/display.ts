export function classLabel(row: {display_name?:string|null;section?:string|null;subjects?:{name?:string|null}|{name?:string|null}[]|null}) {
 const subject=Array.isArray(row.subjects)?row.subjects[0]:row.subjects;
 return [subject?.name?.trim()||row.display_name?.trim()||"Class",row.section?.trim()].filter(Boolean).join(" · ");
}
export function displayName(name:string) {
 return name===name.toUpperCase()?name.toLowerCase().replace(/\b\p{L}/gu,c=>c.toUpperCase()):name;
}
export function istDate(value:string|Date, options:Intl.DateTimeFormatOptions={day:"2-digit",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}) {
 const date=new Date(value);
 return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("en-IN",{...options,timeZone:"Asia/Kolkata"}).format(date):"—";
}

export function istInputToISOString(value:string){return new Date(value+"+05:30").toISOString();}
export function istDateInput(value:string){const date=new Date(value);if(!Number.isFinite(date.getTime()))return "";return new Date(date.getTime()+330*60000).toISOString().slice(0,16);}
