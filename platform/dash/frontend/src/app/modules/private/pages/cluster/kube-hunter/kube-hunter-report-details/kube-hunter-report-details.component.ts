import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {finalize, take, timeout} from 'rxjs/operators';
import {ActivatedRoute} from '@angular/router';
import {IKubeHunterReport, IKubeHunterVulnerabilities} from '../../../../../../core/entities/IKubeHunterReport';
import {KubeHunterService} from '../../../../../../core/services/kube-hunter.service';
import {MatTableDataSource} from '@angular/material/table';
import {ClusterService} from '../../../../../../core/services/cluster.service';
import {ICluster} from '../../../../../../core/entities/ICluster';
import {UtilService} from '../../../../../../core/services/util.service';
import {kubeHunterFindings} from '../../../../../../core/services/kube-hunter-report-parser';

@Component({
  standalone: false,
  selector: 'app-kube-hunter-report-details',
  templateUrl: './kube-hunter-report-details.component.html',
  styleUrls: ['./kube-hunter-report-details.component.scss']
})
export class KubeHunterReportDetailsComponent implements OnInit {

  id: number;
  dateRan: string;
  cluster: ICluster;
  report: IKubeHunterReport;
  nodes: any;
  vulnerabilities: IKubeHunterVulnerabilities[];
  issues: {[location: string]: IKubeHunterVulnerabilities[]} = {};
  loading = true;
  loadError = '';


  displayedColumns: string[] = ['severity', 'category', 'vulnerability', 'description', 'additionalInfo'];
  dataSource: MatTableDataSource<IKubeHunterVulnerabilities>[] = [];
  location: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private kubehunterService: KubeHunterService,
    private clusterService: ClusterService,
    protected readonly utils: UtilService,
    private readonly changeDetector: ChangeDetectorRef
  ) {
    this.id = +this.route.snapshot.paramMap.get('id');
  }

  ngOnInit(): void {
    if (!Number.isSafeInteger(this.id) || this.id <= 0) {
      this.loading = false;
      this.loadError = 'Invalid kube-hunter report identifier.';
      this.changeDetector.markForCheck();
      return;
    }
    this.kubehunterService.getKubeHunterReportById(this.id)
      .pipe(
        take(1),
        timeout(15000),
        // Angular 22 may not run a view check after an RxJS callback unless
        // the view is explicitly marked dirty. Always settle the spinner.
        finalize(() => {
          this.loading = false;
          this.changeDetector.markForCheck();
        })
      )
      .subscribe({
        next: report => {
          this.loading = false;
          this.report = report;
          if (!report || !Number.isSafeInteger(Number(report.clusterId)) || Number(report.clusterId) <= 0) {
            this.loadError = 'The kube-hunter API returned an invalid report.';
            this.changeDetector.markForCheck();
            return;
          }
          this.vulnerabilities = kubeHunterFindings(report.vulnerabilities);
          this.issues = {};
          this.location = [];
          for (const vuln of this.vulnerabilities) {
            const location = String(vuln?.location || 'Unknown location');
            if (!this.issues[location]) {
              this.issues[location] = [];
            }
            this.issues[location].push(vuln);
          }
          this.dateRan = new Date(+report.createdAt).toLocaleDateString();
          this.getCluster(report.clusterId);
          this.populateTable();
          this.changeDetector.markForCheck();
        },
        error: error => {
          this.loading = false;
          this.loadError = error?.name === 'TimeoutError'
            ? 'Kube-hunter report request timed out. Check the Dashboard API.'
            : `Unable to retrieve kube-hunter report (HTTP ${error?.status || 'network error'}).`;
          this.changeDetector.markForCheck();
        },
      });
  }

  populateTable() {
    this.dataSource = Object.keys(this.issues).map( issue => {
      this.location.push(issue);
      return new MatTableDataSource(this.issues[issue]);
    });
  }

  getCluster(clusterId: number) {
    this.clusterService.getClusterById(clusterId).pipe(take(1), timeout(15000)).subscribe({
      next: cluster => {
        this.cluster = cluster?.data;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.loadError = 'Kube-hunter report loaded, but cluster details are unavailable.';
        this.changeDetector.markForCheck();
      }
    });
  }

  showFullDescription(vulnName: string, desc: string) {
    this.utils.showGenericMessageDialog(vulnName, desc);
  }
}
