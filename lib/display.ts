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
