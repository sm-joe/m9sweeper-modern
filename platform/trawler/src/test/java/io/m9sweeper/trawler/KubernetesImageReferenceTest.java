package io.m9sweeper.trawler;

import io.m9sweeper.trawler.framework.docker.DockerImage;
import io.m9sweeper.trawler.framework.docker.DockerImageBuilder;
import io.m9sweeper.trawler.framework.docker.DockerRegistryBuilder;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class KubernetesImageReferenceTest {
    @Test
    void remoteScanMustNotUseKubernetesImageIdAsManifestDigest() {
        DockerImage image = new DockerImageBuilder(1)
                .withName("coredns/coredns")
                .withTag("v1.14.6")
                .withHash("520212b8b0fcd9309d7362d592f513b72880fa5a4e9e8b91442e7ee3b622c6a9")
                .withRegistry(new DockerRegistryBuilder("registry.k8s.io", false, "", null).build())
                .build();
        assertEquals("registry.k8s.io/coredns/coredns:v1.14.6", image.buildFullPath(true, false));
        assertFalse(image.buildFullPath(true, false).contains("@sha256:"));
        assertTrue(image.buildFullPath(true, true).contains("@sha256:"));
    }

    @Test
    void temporaryImageIdNeverBecomesDigest() {
        DockerImage image = new DockerImageBuilder(2)
                .withName("busybox")
                .withTag("1.36")
                .withHash("TMP_pending")
                .withRegistry(new DockerRegistryBuilder("docker.io", false, "", null).build())
                .build();
        assertEquals("docker.io/busybox:1.36", image.buildFullPath(true, false));
    }
    @Test
    void pinnedTagAndManifestDigestMustRemainExactRemoteReference() {
        String manifest = "a".repeat(64);
        DockerImage image = new DockerImageBuilder(3)
                .withName("sm-joe/m9sweeper-trawler")
                .withTag("v0.1.0@sha256:" + manifest)
                .withHash("b".repeat(64))
                .withRegistry(new DockerRegistryBuilder("ghcr.io", false, "", null).build())
                .build();
        assertEquals("ghcr.io/sm-joe/m9sweeper-trawler:v0.1.0@sha256:" + manifest,
                image.buildFullPath(true, false));
        assertEquals(image.buildFullPath(true, false), image.buildFullPath(true, true));
    }

    @Test
    void digestOnlyReferenceHasNoSyntheticColon() {
        String manifest = "a".repeat(64);
        DockerImage image = new DockerImageBuilder(4)
                .withName("sm-joe/m9sweeper-trawler")
                .withTag("@sha256:" + manifest)
                .withHash("b".repeat(64))
                .withRegistry(new DockerRegistryBuilder("ghcr.io", false, "", null).build())
                .build();
        assertEquals("ghcr.io/sm-joe/m9sweeper-trawler@sha256:" + manifest,
                image.buildFullPath(true, false));
    }

}
