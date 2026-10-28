import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import multer from 'multer';
import nodemailer from 'nodemailer';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

dotenv.config();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const PORT=Number(process.env.PORT||8080);
const ORIGIN=process.env.ALLOWED_ORIGIN||`http://localhost:${PORT}`;
const db=new Database(path.join(__dirname,'payments.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,payer_name TEXT NOT NULL,payer_email TEXT,payer_type TEXT,amount INTEGER NOT NULL,frequency TEXT NOT NULL,status TEXT NOT NULL,gateway TEXT NOT NULL DEFAULT 'razorpay',gateway_subscription_id TEXT UNIQUE,mandate_id TEXT,consent_at TEXT NOT NULL,created_at TEXT NOT NULL,next_payment_at TEXT,retry_count INTEGER NOT NULL DEFAULT 0);CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,gateway_payment_id TEXT UNIQUE,subscription_id TEXT,gateway_subscription_id TEXT,transaction_id TEXT,amount INTEGER,status TEXT,method TEXT,payer_name TEXT,payment_date TEXT,auto_pay_status TEXT,raw_event TEXT,created_at TEXT);CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_email TEXT,action TEXT,details TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS partner_applications(id TEXT PRIMARY KEY,app_id TEXT UNIQUE NOT NULL,type TEXT NOT NULL,name TEXT NOT NULL,contact TEXT,mobile TEXT,whatsapp TEXT,email TEXT,state TEXT,district TEXT,city TEXT,pincode TEXT,address TEXT,education TEXT,remarks TEXT,status TEXT NOT NULL DEFAULT 'New',payload TEXT NOT NULL,submitted_at TEXT NOT NULL);`);

app.use(helmet({contentSecurityPolicy:false}));
app.use((req,res,next)=>{const requestOrigin=String(req.headers.origin||'');const allowedOrigins=new Set([ORIGIN,'http://localhost:5500','http://127.0.0.1:5500','http://localhost:5501','http://127.0.0.1:5501','null']);res.setHeader('Access-Control-Allow-Origin',allowedOrigins.has(requestOrigin)?requestOrigin:ORIGIN);res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,X-Admin-Email');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next()});
app.use(rateLimit({windowMs:60_000,max:120,standardHeaders:true,legacyHeaders:false}));

const ADMIN_EMAILS=new Set(['balajinaik5069@gmail.com','koppelagayathri@gmail.com','admin3@onthewaylogistics.in','admin4@onthewaylogistics.in']);
function adminEmailOf(req){const email=String(req.header('X-Admin-Email')||'').toLowerCase();return ADMIN_EMAILS.has(email)?email:''}
function adminGuard(req,res,next){const email=adminEmailOf(req);if(!email)return res.status(403).json({error:'Admin access denied'});req.adminEmail=email;next()}
function razorHeaders(){return {Authorization:'Basic '+Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64'),'Content-Type':'application/json'}}
async function razor(pathname,options={}){if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)throw new Error('Razorpay backend credentials are not configured');const r=await fetch('https://api.razorpay.com/v1'+pathname,{...options,headers:{...razorHeaders(),...(options.headers||{})}});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={raw:text}}if(!r.ok)throw new Error(data?.error?.description||`Razorpay API error ${r.status}`);return data}
function planFor(f){return f==='Daily'?process.env.RAZORPAY_PLAN_DAILY_ID:f==='Monthly'?process.env.RAZORPAY_PLAN_MONTHLY_ID:process.env.RAZORPAY_PLAN_WEEKLY_ID}
function audit(email,action,details){db.prepare('INSERT INTO audit_log(admin_email,action,details,created_at) VALUES(?,?,?,?)').run(email,action,JSON.stringify(details||{}),new Date().toISOString())}

// IMPORTANT: raw body is required for webhook HMAC verification.
app.post('/api/razorpay/webhook',express.raw({type:'application/json'}),(req,res)=>{
  try{
    const secret=process.env.RAZORPAY_WEBHOOK_SECRET||'';const signature=String(req.header('X-Razorpay-Signature')||'');
    if(!secret||!signature)return res.status(400).send('Webhook secret/signature missing');
    const expected=crypto.createHmac('sha256',secret).update(req.body).digest('hex');
    if(!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature)))return res.status(400).send('Invalid signature');
    const event=JSON.parse(req.body.toString('utf8'));const entity=event?.payload?.payment?.entity||event?.payload?.subscription?.entity||{};const payment=event?.payload?.payment?.entity;
    if(payment){const status=event.event==='payment.captured'||event.event==='payment.authorized'?'Successful':event.event==='payment.failed'?'Failed':'Pending';db.prepare(`INSERT INTO transactions(gateway_payment_id,subscription_id,gateway_subscription_id,transaction_id,amount,status,method,payer_name,payment_date,auto_pay_status,raw_event,created_at) VALUES(@gateway_payment_id,@subscription_id,@gateway_subscription_id,@transaction_id,@amount,@status,@method,@payer_name,@payment_date,@auto_pay_status,@raw_event,@created_at) ON CONFLICT(gateway_payment_id) DO UPDATE SET status=excluded.status,raw_event=excluded.raw_event,payment_date=excluded.payment_date`).run({gateway_payment_id:payment.id,subscription_id:null,gateway_subscription_id:payment.subscription_id||null,transaction_id:payment.id,amount:Number(payment.amount||0)/100,status,method:payment.method||'Unknown',payer_name:'',payment_date:new Date().toISOString().slice(0,10),auto_pay_status:payment.subscription_id?'Active':'Cancelled',raw_event:JSON.stringify(event),created_at:new Date().toISOString()})}
    if(event.event?.startsWith('subscription.')){const sub=entity;db.prepare('UPDATE subscriptions SET status=?,next_payment_at=? WHERE gateway_subscription_id=?').run(String(sub.status||'unknown'),sub.charge_at?new Date(Number(sub.charge_at)*1000).toISOString():null,sub.id)}
    return res.sendStatus(200);
  }catch(err){return res.status(500).send('Webhook processing error')}
});
app.use(express.json({limit:'100kb'}));


const PARTNER_STATUSES=['New','Contacted','Under Review','Documents Pending','Accepted','Rejected'];
const PARTNER_DECISIONS=['Accepted','Rejected'];
// Older versions called "Accepted" "Approved"; treat both the same.
function normalizeStatus(v){const s=String(v??'').trim();return s==='Approved'?'Accepted':s}
// One-time upgrade of records saved with the old "Approved" status.
for(const r of db.prepare("SELECT id,payload FROM partner_applications WHERE status='Approved'").all()){const p=JSON.parse(r.payload);p.status='Accepted';db.prepare('UPDATE partner_applications SET status=?,payload=? WHERE id=?').run('Accepted',JSON.stringify(p),r.id)}
const PARTNER_EDITABLE=['name','contact','mobile','whatsapp','email','state','district','city','pincode','street','locality','nearby','landmark','address','education','remarks','status'];
function partnerPrefix(type){return String(type||'').toLowerCase()==='vendor'?'VN':'FP'}
function nextApplicationId(type){
  const prefix=partnerPrefix(type);
  const row=db.prepare("SELECT app_id FROM partner_applications WHERE app_id LIKE ? ORDER BY app_id DESC LIMIT 1").get(prefix+'-%');
  const last=Number(String(row?.app_id||'').split('-')[1]||0);
  return prefix+'-'+String(last+1).padStart(6,'0');
}
app.post('/api/partner-applications',(req,res)=>{
  try{
    const input=req.body||{};
    const type=String(input.type||input.portalType||'').toLowerCase()==='vendor'?'Vendor':'Franchise';
    const name=String(input.fullName||input.name||input.companyName||'').trim();
    if(!name)return res.status(400).json({error:'Applicant name is required'});
    const appId=nextApplicationId(type),id=crypto.randomUUID(),submittedAt=new Date().toISOString();
    const createdBy=adminEmailOf(req);const status=createdBy&&PARTNER_STATUSES.includes(normalizeStatus(input.status))?normalizeStatus(input.status):'New';
    const payload={...input,type,name,contact:String(input.contactName||input.fullName||name),mobile:String(input.contactNumber||input.mobile||''),whatsapp:String(input.whatsappNumber||input.whatsapp||''),email:String(input.gmail||input.email||''),state:String(input.state||'Andhra Pradesh'),district:String(input.district||''),city:String(input.cityOrVillage||input.city||''),pincode:String(input.pincode||''),address:String(input.address||input.fullAddress||''),street:String(input.street||input.address||input.fullAddress||''),locality:String(input.locality||input.location||'').split('|')[0].trim(),education:String(input.education||input.educationalQualification||''),remarks:String(input.remarks||input.experience||''),id,appId,status,submittedAt,source:createdBy?'Admin panel':'Website'};
    if(createdBy)payload.createdBy=createdBy;
    db.prepare(`INSERT INTO partner_applications(id,app_id,type,name,contact,mobile,whatsapp,email,state,district,city,pincode,address,education,remarks,status,payload,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,appId,type,name,payload.contact,payload.mobile,payload.whatsapp,payload.email,payload.state,payload.district,payload.city,payload.pincode,payload.address,payload.education,payload.remarks,status,JSON.stringify(payload),submittedAt);
    if(createdBy)audit(createdBy,'partner_application_created',{appId,type});
    res.status(201).json({ok:true,application:payload});
  }catch(err){res.status(500).json({error:'Could not save application'})}
});
// Admin edits (status, contact details...) are saved on the server so every admin sees them
// and the next refresh does not undo them. The applicant's original form answers are kept.
app.patch('/api/partner-applications/:id',adminGuard,(req,res)=>{
  try{
    const row=db.prepare('SELECT payload FROM partner_applications WHERE id=?').get(String(req.params.id));
    if(!row)return res.status(404).json({error:'Application not found'});
    const current=JSON.parse(row.payload),input=req.body||{},changes={};
    for(const k of PARTNER_EDITABLE)if(input[k]!==undefined)changes[k]=String(input[k]??'').slice(0,2000);
    if(changes.status!==undefined)changes.status=normalizeStatus(changes.status);
    if(changes.status!==undefined&&!PARTNER_STATUSES.includes(changes.status))return res.status(400).json({error:'Invalid status'});
    if(changes.name!==undefined&&!changes.name.trim())return res.status(400).json({error:'Applicant name is required'});
    const next={...current,...changes,updatedAt:new Date().toISOString(),updatedBy:req.adminEmail};
    if(changes.status!==undefined&&changes.status!==current.status){if(PARTNER_DECISIONS.includes(changes.status)){next.decidedBy=req.adminEmail;next.decidedAt=next.updatedAt}else{delete next.decidedBy;delete next.decidedAt;delete next.decisionNote}}
    if(input.type!==undefined){const t=String(input.type).toLowerCase()==='vendor'?'Vendor':'Franchise';if(t!==current.type){next.type=t;next.appId=nextApplicationId(t);next.previousAppId=current.appId}}
    db.prepare('UPDATE partner_applications SET app_id=?,type=?,name=?,contact=?,mobile=?,whatsapp=?,email=?,state=?,district=?,city=?,pincode=?,address=?,education=?,remarks=?,status=?,payload=? WHERE id=?').run(next.appId,next.type,next.name,next.contact||'',next.mobile||'',next.whatsapp||'',next.email||'',next.state||'',next.district||'',next.city||'',next.pincode||'',next.address||'',next.education||'',next.remarks||'',next.status||'New',JSON.stringify(next),current.id);
    audit(req.adminEmail,'partner_application_updated',{appId:next.appId,changes:Object.keys(changes)});
    res.json({ok:true,application:next});
  }catch(err){res.status(500).json({error:'Could not update application'})}
});
// Accept / Reject an application. Records the decision, an optional note, which admin decided and when.
// decision "Pending" undoes a decision (back to "Under Review").
app.post('/api/partner-applications/:id/decision',adminGuard,(req,res)=>{
  try{
    const decision=normalizeStatus(req.body?.decision);
    if(![...PARTNER_DECISIONS,'Pending'].includes(decision))return res.status(400).json({error:'Decision must be Accepted, Rejected or Pending'});
    const row=db.prepare('SELECT payload FROM partner_applications WHERE id=?').get(String(req.params.id));
    if(!row)return res.status(404).json({error:'Application not found'});
    const current=JSON.parse(row.payload),now=new Date().toISOString();
    const next={...current,updatedAt:now,updatedBy:req.adminEmail};
    if(decision==='Pending'){next.status='Under Review';delete next.decidedBy;delete next.decidedAt;delete next.decisionNote}
    else{next.status=decision;next.decidedBy=req.adminEmail;next.decidedAt=now;next.decisionNote=String(req.body?.note||'').trim().slice(0,1000)}
    db.prepare('UPDATE partner_applications SET status=?,payload=? WHERE id=?').run(next.status,JSON.stringify(next),current.id);
    audit(req.adminEmail,'partner_application_'+(decision==='Pending'?'decision_undone':decision.toLowerCase()),{appId:next.appId,note:next.decisionNote||''});
    res.json({ok:true,application:next});
  }catch(err){res.status(500).json({error:'Could not save decision'})}
});
app.get('/api/partner-applications',adminGuard,(req,res)=>{
  try{
    const rows=db.prepare('SELECT payload FROM partner_applications ORDER BY submitted_at DESC').all();
    res.json(rows.map(r=>JSON.parse(r.payload)));
  }catch(err){res.status(500).json({error:'Could not load applications'})}
});
app.get('/api/health',(req,res)=>res.json({ok:true,gateway:'Razorpay',mode:process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')?'sandbox':'live'}));
app.get('/api/payments/history',adminGuard,(req,res)=>res.json(db.prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 1000').all()));
app.get('/api/autopay',adminGuard,(req,res)=>res.json(db.prepare('SELECT * FROM subscriptions ORDER BY next_payment_at ASC').all()));
app.post('/api/autopay/create',adminGuard,async(req,res)=>{
  try{
    const {payerName,payerEmail,payerType,amount,frequency,consent}=req.body||{};if(!payerName||!amount||!frequency||!consent)return res.status(400).json({error:'Payer name, amount, frequency and explicit consent are required'});
    const planId=planFor(frequency);if(!planId)return res.status(400).json({error:`Razorpay ${frequency} plan is not configured`});
    const payload={plan_id:planId,total_count:120,customer_notify:1,notes:{payer_name:String(payerName),payer_type:String(payerType||'Customer')}};
    const sub=await razor('/subscriptions',{method:'POST',body:JSON.stringify(payload)});
    const now=new Date().toISOString();db.prepare(`INSERT INTO subscriptions(id,payer_name,payer_email,payer_type,amount,frequency,status,gateway,gateway_subscription_id,consent_at,created_at,next_payment_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),payerName,payerEmail||'',payerType||'Customer',Number(amount),frequency,'Pending Authorization','razorpay',sub.id,now,now,null);
    audit(req.adminEmail,'autopay_created',{gateway_subscription_id:sub.id,payer:payerName,frequency,amount});
    res.json({id:sub.id,status:sub.status||'created',short_url:sub.short_url||null});
  }catch(err){res.status(502).json({error:err.message})}
});
app.post('/api/autopay/:id/pause',adminGuard,async(req,res)=>{try{const out=await razor(`/subscriptions/${encodeURIComponent(req.params.id)}/pause`,{method:'POST',body:JSON.stringify({pause_at:'now'})});db.prepare('UPDATE subscriptions SET status=? WHERE gateway_subscription_id=?').run('Paused',req.params.id);audit(req.adminEmail,'autopay_paused',{id:req.params.id});res.json(out)}catch(err){res.status(502).json({error:err.message})}});
app.post('/api/autopay/:id/resume',adminGuard,async(req,res)=>{try{const out=await razor(`/subscriptions/${encodeURIComponent(req.params.id)}/resume`,{method:'POST',body:JSON.stringify({resume_at:'now'})});db.prepare('UPDATE subscriptions SET status=? WHERE gateway_subscription_id=?').run('Active',req.params.id);audit(req.adminEmail,'autopay_resumed',{id:req.params.id});res.json(out)}catch(err){res.status(502).json({error:err.message})}});
app.post('/api/autopay/:id/cancel',adminGuard,async(req,res)=>{try{const out=await razor(`/subscriptions/${encodeURIComponent(req.params.id)}/cancel`,{method:'POST',body:JSON.stringify({cancel_at_cycle_end:0})});db.prepare('UPDATE subscriptions SET status=? WHERE gateway_subscription_id=?').run('Cancelled',req.params.id);audit(req.adminEmail,'autopay_cancelled',{id:req.params.id});res.json(out)}catch(err){res.status(502).json({error:err.message})}});

// ===================== Vendor Portal: Helpline / Support =====================
// The vendor portal's support form (Settings page) posts here; details + photo are emailed
// to SUPPORT_EMAIL using the Gmail account in .env (GMAIL_USER + GMAIL_APP_PASSWORD).
const SUPPORT_EMAIL=process.env.SUPPORT_EMAIL||'onthewaynpr@gmail.com';
const supportUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:10,fieldSize:20000}});
const supportLimiter=rateLimit({windowMs:10*60_000,max:5,standardHeaders:true,legacyHeaders:false,message:{error:'Too many support requests. Please wait a few minutes and try again.'}});
let mailTransporter=null;
function getMailTransporter(){
  // Optional: another mail provider via SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS.
  if(process.env.SMTP_HOST){
    const user=process.env.SMTP_USER||process.env.GMAIL_USER||SUPPORT_EMAIL;
    if(!mailTransporter)mailTransporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_PASS?{user,pass:process.env.SMTP_PASS}:undefined});
    return {transporter:mailTransporter,user};
  }
  const user=process.env.GMAIL_USER||SUPPORT_EMAIL,pass=String(process.env.GMAIL_APP_PASSWORD||'').replace(/\s+/g,'');
  if(!pass||pass.startsWith('replace_'))return null;
  if(!mailTransporter)mailTransporter=nodemailer.createTransport({service:'gmail',auth:{user,pass}});
  return {transporter:mailTransporter,user};
}
const oneLine=v=>String(v||'').replace(/[\r\n]+/g,' ').trim();
app.post('/api/support',supportLimiter,(req,res)=>{
  supportUpload.single('photo')(req,res,async err=>{
    if(err)return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'The photo is too large. Please attach an image under 8 MB.':'Could not read the attached photo. Please try another image.'});
    try{
      const name=oneLine(req.body?.name).slice(0,120),email=oneLine(req.body?.email).slice(0,254),phone=oneLine(req.body?.phone).slice(0,30);
      const description=String(req.body?.description||'').trim().slice(0,3000),photo=req.file;
      if(!name||!email||!description||!photo)return res.status(400).json({error:'Please provide your name, email, problem description, and a photo.'});
      if(!/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(email))return res.status(400).json({error:'Please provide a valid email address.'});
      if(!photo.mimetype||!photo.mimetype.startsWith('image/'))return res.status(400).json({error:'The attachment must be an image.'});
      const mail=getMailTransporter();
      if(!mail){console.error('Support email is not configured: set GMAIL_APP_PASSWORD in backend/.env');return res.status(503).json({error:'Support email is not configured yet. Please contact the portal administrator.'})}
      await mail.transporter.sendMail({
        from:{name:'ON THE WAY LOGISTICS Support',address:mail.user},to:SUPPORT_EMAIL,replyTo:{name,address:email},
        subject:`Portal support issue from ${name}`,
        text:`New Helpline / Support request\n\nCustomer name: ${name}\nEmail address: ${email}\nContact number: ${phone||'Not provided'}\n\nProblem description:\n${description}\n\nThe customer photo is attached.`,
        attachments:[{filename:path.basename(photo.originalname||'support-photo').slice(0,100),content:photo.buffer,contentType:photo.mimetype}]
      });
      res.json({ok:true,message:'Your issue has been submitted. Our support team will contact you soon.'});
    }catch(e){console.error('Support submission failed:',e.message);res.status(502).json({error:'We could not send your issue to the support team. Please try again later.'})}
  });
});

app.use('/vendor',express.static(path.join(__dirname,'..','vendor-portal')));
app.use('/dashboard',express.static(path.join(__dirname,'..','dashboard')));
app.use(express.static(path.join(__dirname,'..','website')));
app.listen(PORT,()=>{console.log(`On The Way Logistics running on http://localhost:${PORT}`);console.log(`  Website:       http://localhost:${PORT}/`);console.log(`  Admin panel:   http://localhost:${PORT}/dashboard/`);console.log(`  Vendor portal: http://localhost:${PORT}/vendor/`)});
