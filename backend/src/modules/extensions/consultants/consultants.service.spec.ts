import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ConsultantsService } from "./consultants.service";

describe("ConsultantsService", () => {
  let service: ConsultantsService;
  let prisma: {
    extConsultantProfile: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    submission: {
      findUnique: jest.Mock;
    };
    extConsultationRequest: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    extConsultationFeedback: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      extConsultantProfile: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      submission: {
        findUnique: jest.fn(),
      },
      extConsultationRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      extConsultationFeedback: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultantsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ConsultantsService>(ConsultantsService);
  });

  describe("getPermanentConsultants", () => {
    it("returns list of active dentistry consultants", async () => {
      prisma.extConsultantProfile.findMany.mockResolvedValue([
        {
          userId: "u1",
          faculty: "Facultad de Odontología",
          specialty: "Endodoncia",
          department: "Clínica",
          isActive: true,
          user: { id: "u1", name: "Dr. Carlos", email: "carlos@ceish.edu" },
        },
      ]);

      const result = await service.getPermanentConsultants();
      expect(result).toHaveLength(1);
      expect(result[0].specialty).toBe("Endodoncia");
      expect(result[0].name).toBe("Dr. Carlos");
    });
  });

  describe("createRequest", () => {
    it("throws error if requester is the consultant", async () => {
      await expect(
        service.createRequest("u1", {
          submissionId: "s1",
          consultantId: "u1",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws error if submission does not exist", async () => {
      prisma.submission.findUnique.mockResolvedValue(null);

      await expect(
        service.createRequest("u1", {
          submissionId: "s1",
          consultantId: "u2",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws error if consultant is not active", async () => {
      prisma.submission.findUnique.mockResolvedValue({ id: "s1" });
      prisma.extConsultantProfile.findUnique.mockResolvedValue({
        isActive: false,
      });

      await expect(
        service.createRequest("u1", {
          submissionId: "s1",
          consultantId: "u2",
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("creates consultation request successfully", async () => {
      prisma.submission.findUnique.mockResolvedValue({ id: "s1" });
      prisma.extConsultantProfile.findUnique.mockResolvedValue({
        isActive: true,
      });
      prisma.extConsultationRequest.findFirst.mockResolvedValue(null);
      prisma.extConsultationRequest.create.mockResolvedValue({
        id: "req-1",
        submissionId: "s1",
        status: "pending",
      });

      const res = await service.createRequest("u1", {
        submissionId: "s1",
        consultantId: "u2",
        instructions: "Por favor revisar protocolo pulpar",
      });

      expect(res.id).toBe("req-1");
      expect(prisma.extConsultationRequest.create).toHaveBeenCalled();
    });
  });

  describe("submitFeedback", () => {
    it("throws error if user is not the assigned consultant", async () => {
      prisma.extConsultationRequest.findUnique.mockResolvedValue({
        id: "req-1",
        consultantId: "u2",
        status: "pending",
      });

      await expect(
        service.submitFeedback("req-1", "u-other", {
          feedbacks: [
            { criteriaLabel: "Criterio 1", technicalComments: "Observación" },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("saves feedbacks and marks request as completed", async () => {
      prisma.extConsultationRequest.findUnique.mockResolvedValue({
        id: "req-1",
        consultantId: "u2",
        status: "pending",
      });
      prisma.extConsultationRequest.update.mockResolvedValue({
        id: "req-1",
        status: "completed",
        feedbacks: [{ id: "fb-1" }],
      });

      const res = await service.submitFeedback("req-1", "u2", {
        feedbacks: [
          {
            criteriaLabel: "Metodología",
            suggestedStatus: "approved",
            technicalComments: "Cumple con técnica de aislamiento",
          },
        ],
      });

      expect(res.status).toBe("completed");
      expect(prisma.extConsultationFeedback.createMany).toHaveBeenCalled();
    });
  });

  describe("acceptAllFeedback", () => {
    it("marks all feedbacks as accepted", async () => {
      prisma.extConsultationRequest.findUnique
        .mockResolvedValueOnce({ id: "req-1", status: "completed" })
        .mockResolvedValueOnce({
          id: "req-1",
          status: "completed",
          feedbacks: [{ isAcceptedByMember: true }],
        });

      const res = await service.acceptAllFeedback("req-1", "u1");
      expect(prisma.extConsultationFeedback.updateMany).toHaveBeenCalledWith({
        where: { requestId: "req-1" },
        data: { isAcceptedByMember: true },
      });
      expect(res?.feedbacks[0].isAcceptedByMember).toBe(true);
    });
  });
});
