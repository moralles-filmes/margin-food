// Divide SQL preservando strings, dollar quotes e comentários; não interpreta DDL.
export function splitSql(sql) {
 const parts=[];let start=0,quote=null,dollar=null,block=0,line=false,escapeString=false;
 for(let i=0;i<sql.length;i++){
  const ch=sql[i],next=sql[i+1];
  if(line){if(ch==='\n')line=false;continue;}
  if(block){if(ch==='/'&&next==='*'){block++;i++;}else if(ch==='*'&&next==='/'){block--;i++;}continue;}
  if(dollar){if(sql.startsWith(dollar,i)){i+=dollar.length-1;dollar=null;}continue;}
  if(quote){if(ch===quote){if(next===quote)i++;else quote=null;}else if(ch==='\\'&&escapeString)i++;continue;}
  if(ch==='-'&&next==='-'){line=true;i++;continue;}
  if(ch==='/'&&next==='*'){block=1;i++;continue;}
  if(ch==="'"||ch==='"'){escapeString=ch==="'"&&/[eE]/.test(sql[i-1]??'')&&!/[\w$]/.test(sql[i-2]??'');quote=ch;continue;}
  if(ch==='$'){const m=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);if(m){dollar=m[0];i+=dollar.length-1;continue;}}
  if(ch===';'){const s=sql.slice(start,i).trim();if(s)parts.push(s);start=i+1;}
 }
 if(quote||dollar||block)throw new Error('SQL lexical state incomplete');
 const rest=sql.slice(start).trim();if(rest&&!/^(?:--[^\n]*(?:\n|$)|\s)*$/.test(rest))parts.push(rest);
 return parts;
}
