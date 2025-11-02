import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  vus: 50,
  duration: '1m',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1500'],
  },
};

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_ANON = __ENV.SUPABASE_ANON;
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN; // user access token

export default function() {
  const url = `${SUPABASE_URL}/functions/v1/macros`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
  };
  const isText = Math.random() < 0.6;
  const payload = isText ? {
    kind: 'text',
    name: 'paneer tikka',
    portion: '150 g',
    previewOnly: true,
  } : {
    kind: 'image',
    image_path: 'food_snaps/dummy/2025/10/23/sample.jpg', // ensure exists or use a test path
    previewOnly: true,
  };

  const res = http.post(url, JSON.stringify(payload), { headers });
  check(res, { 'status is 200': (r) => r.status === 200 || r.status === 500 });
  sleep(0.3);
}




