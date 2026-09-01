const { pool } = require('./src/core/db/pgPool');
require('dotenv').config();

pool.query(`
   select u.user_id, ds.score_value, rl.name as risk_level_name
     from users u
     left join lateral (
       select score_value, risk_level_id
       from distress_scores
       where user_id = u.user_id
       order by computed_at desc
       limit 1
     ) ds on true
     left join risk_levels rl on rl.risk_level_id = ds.risk_level_id
`).then(r => console.log(r.rows.slice(0, 2))).catch(console.error).finally(() => process.exit(0));
