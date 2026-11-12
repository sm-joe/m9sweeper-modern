import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { ClusterService } from '../../../../../core/services/cluster.service';

@Component({
  standalone: false,
  selector: 'app-cluster-details',
  templateUrl: './cluster-details.component.html',
  styleUrls: ['./cluster-details.component.scss']
})
export class ClusterDetailsComponent implements OnInit, OnDestroy {
  private readonly destroyed$ = new Subject<void>();
  clusterLoadError = false;
  cluster: any;
  groupId: any;
  isClusterLoaded = false;

  constructor(
    private clusterService: ClusterService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroyed$)).subscribe(params => {
      const clusterId = Number(params.get('id'));
      if (Number.isSafeInteger(clusterId) && clusterId > 0) {
        this.getClusterById(clusterId);
      } else {
        this.clusterLoadError = true;
        this.isClusterLoaded = false;
      }
    });
  }

  getClusterById(clusterId: number) {
    this.isClusterLoaded = false;
    this.clusterLoadError = false;
    this.clusterService.getClusterById(clusterId).pipe(takeUntil(this.destroyed$)).subscribe({
      next: response => {
        this.cluster = response?.data;
        this.isClusterLoaded = !!this.cluster;
        this.clusterLoadError = !this.cluster;
      },
      error: () => {
        this.isClusterLoaded = false;
        this.clusterLoadError = true;
      }
    });
  }
  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }
}
