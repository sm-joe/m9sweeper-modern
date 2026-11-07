import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { take } from 'rxjs/operators';
import { CommonService } from '../../../../core/services/common.service';

/**
 * First standalone/Signals-backed feature in the new-product shell.
 * Shows whether operators have configured a Kubernetes-Pod-reachable report path.
 * It intentionally never displays API keys or the complete callback URL.
 */
@Component({
  selector: 'app-scanner-connectivity',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="scanner-status" aria-label="Scanner report ingestion connectivity">
      <div>
        <strong>Scanner report ingestion</strong>
        <span class="detail">Kubernetes Jobs must reach the API independently of your browser.</span>
      </div>
      <div aria-live="polite" role="status">
        <span *ngIf="state() === 'loading'">Checking configuration…</span>
        <span *ngIf="state() === 'configured'" class="configured">Configured: {{ endpointHost() }}</span>
        <span *ngIf="state() === 'missing'" class="missing">Not configured — scanner report uploads may fail</span>
        <span *ngIf="state() === 'error'" class="missing">Unable to verify scanner configuration</span>
      </div>
    </section>
  `,
  styles: [`
    .scanner-status {display:flex;justify-content:space-between;gap:18px;align-items:center;flex-wrap:wrap;
      padding:14px 38px;border-bottom:1px solid #d6e4ec;background:#eef6fa;color:#16334a;font-size:13px}
    .scanner-status strong {display:block;font-size:14px}
    .detail {display:block;margin-top:3px;color:#435d70}
    .configured {color:#13664d;font-weight:600}
    .missing {color:#9d3b22;font-weight:600}
    @media(max-width:700px){.scanner-status{padding:14px 18px}}
  `]
})
export class ScannerConnectivityComponent implements OnInit {
  readonly state = signal<'loading' | 'configured' | 'missing' | 'error'>('loading');
  readonly endpointHost = signal('');

  constructor(private readonly commonService: CommonService) {}

  ngOnInit(): void {
    this.commonService.getBaseUrl().pipe(take(1)).subscribe({
      next: response => {
        const endpoint = (response.data as {reportIngestionUrl?: string | null})?.reportIngestionUrl;
        if (!endpoint) { this.state.set('missing'); return; }
        try {
          this.endpointHost.set(new URL(endpoint).host);
          this.state.set('configured');
        } catch {
          this.state.set('error');
        }
      },
      error: () => this.state.set('error')
    });
  }
}
