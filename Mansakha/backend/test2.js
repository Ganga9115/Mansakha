const { pool } = require('./src/db/pgClient');
require('dotenv').config();

pool.query(`
   select v.victim_id, ds.score_value, rl.name as risk_level_name
     from victims v
     left join lateral (
       select score_value, risk_level_id
       from distress_scores
       where victim_id = v.victim_id
       order by computed_at desc
       limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
`).then(r => console.log(r.rows.slice(0, 2))).catch(console.error).finally(() => process.exit(0));
