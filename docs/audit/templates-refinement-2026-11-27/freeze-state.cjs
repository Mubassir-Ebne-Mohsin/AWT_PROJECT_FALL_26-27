// Deliberate state-update fault; isolated unit process only. Never loaded by the app.
const React=require(require.resolve("react",{paths:[process.cwd()]}));const useState=React.useState;React.useState=initial=>{const result=useState(initial);return [result[0],()=>{}];};
