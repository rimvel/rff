import { ImageResponse } from 'next/og';

// Picture shown when a link to the site is shared (Messenger, Slack, LinkedIn, …)
export const alt = 'RFF – cheap flights, beyond direct';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '80px',
                    color: 'white',
                    background: 'linear-gradient(135deg, #5161ce 0%, #5b3687 100%)',
                }}
            >
                <div style={{ fontSize: 150, fontWeight: 800, letterSpacing: '-4px', lineHeight: 1 }}>RFF</div>
                <div style={{ fontSize: 56, marginTop: 24, opacity: 0.9 }}>Cheap flights, beyond direct</div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 64, fontSize: 36, opacity: 0.85 }}>
                    <span>VNO</span>
                    <span style={{ width: 140, height: 4, background: 'white', margin: '0 24px', borderRadius: 2 }} />
                    <span style={{ padding: '6px 18px', border: '3px dashed white', borderRadius: 999, fontSize: 30 }}>3h layover</span>
                    <span style={{ width: 140, height: 4, background: 'white', margin: '0 24px', borderRadius: 2 }} />
                    <span>BCN</span>
                </div>
                <div style={{ marginTop: 'auto', fontSize: 26, opacity: 0.6 }}>
                    One-stop connections · Flexible dates · Price calendar · Anywhere
                </div>
            </div>
        ),
        size,
    );
}
