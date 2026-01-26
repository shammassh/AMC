-- =============================================
-- Area Manager Checklist Database Setup
-- Database: GMRL_AMC
-- =============================================

-- Create Database (run this separately if needed)
-- CREATE DATABASE GMRL_AMC;
-- GO
-- USE GMRL_AMC;
-- GO

-- =============================================
-- 1. User Roles Table
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserRoles')
BEGIN
    CREATE TABLE UserRoles (
        Id INT PRIMARY KEY IDENTITY(1,1),
        RoleName NVARCHAR(50) NOT NULL UNIQUE,
        Description NVARCHAR(255),
        CreatedAt DATETIME2 DEFAULT GETDATE()
    );
    
    INSERT INTO UserRoles (RoleName, Description) VALUES 
        ('Admin', 'Full system access - manages all settings'),
        ('HeadOfOperations', 'Defines questions and coefficients, views all reports'),
        ('AreaManager', 'Fills checklists for assigned stores'),
        ('Pending', 'Awaiting role assignment');
    
    PRINT 'UserRoles table created';
END
GO

-- =============================================
-- 2. Users Table
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        Id INT PRIMARY KEY IDENTITY(1,1),
        Email NVARCHAR(255) NOT NULL UNIQUE,
        DisplayName NVARCHAR(255),
        AzureOid NVARCHAR(255),
        RoleId INT FOREIGN KEY REFERENCES UserRoles(Id) DEFAULT 4,
        IsApproved BIT DEFAULT 0,
        IsActive BIT DEFAULT 1,
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        LastLoginAt DATETIME2,
        UpdatedAt DATETIME2
    );
    
    -- Create Admin user
    INSERT INTO Users (Email, DisplayName, RoleId, IsApproved, IsActive)
    VALUES ('Muhammad.shammas@gmrlgroup.com', 'Muhammad Shammas', 1, 1, 1);
    
    PRINT 'Users table created with admin user';
END
GO

-- =============================================
-- 3. Sessions Table
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Sessions')
BEGIN
    CREATE TABLE Sessions (
        Id INT PRIMARY KEY IDENTITY(1,1),
        SessionId NVARCHAR(255) NOT NULL UNIQUE,
        UserId INT FOREIGN KEY REFERENCES Users(Id),
        Token NVARCHAR(MAX),
        ExpiresAt DATETIME2,
        CreatedAt DATETIME2 DEFAULT GETDATE()
    );
    
    CREATE INDEX IX_Sessions_SessionId ON Sessions(SessionId);
    CREATE INDEX IX_Sessions_ExpiresAt ON Sessions(ExpiresAt);
    
    PRINT 'Sessions table created';
END
GO

-- =============================================
-- 4. Stores Table
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Stores')
BEGIN
    CREATE TABLE Stores (
        Id INT PRIMARY KEY IDENTITY(1,1),
        StoreName NVARCHAR(255) NOT NULL,
        StoreCode NVARCHAR(50),
        IsActive BIT DEFAULT 1,
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        UpdatedAt DATETIME2
    );
    
    PRINT 'Stores table created';
END
GO

-- =============================================
-- 5. Store Assignments (Area Manager -> Stores)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'StoreAssignments')
BEGIN
    CREATE TABLE StoreAssignments (
        Id INT PRIMARY KEY IDENTITY(1,1),
        UserId INT FOREIGN KEY REFERENCES Users(Id),
        StoreId INT FOREIGN KEY REFERENCES Stores(Id),
        AssignedAt DATETIME2 DEFAULT GETDATE(),
        AssignedBy INT FOREIGN KEY REFERENCES Users(Id),
        IsActive BIT DEFAULT 1,
        UNIQUE(UserId, StoreId)
    );
    
    CREATE INDEX IX_StoreAssignments_UserId ON StoreAssignments(UserId);
    CREATE INDEX IX_StoreAssignments_StoreId ON StoreAssignments(StoreId);
    
    PRINT 'StoreAssignments table created';
END
GO

-- =============================================
-- 6. Questions Table (Checklist Items)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Questions')
BEGIN
    CREATE TABLE Questions (
        Id INT PRIMARY KEY IDENTITY(1,1),
        QuestionText NVARCHAR(500) NOT NULL,
        Coefficient DECIMAL(5,2) NOT NULL DEFAULT 1.00,
        SortOrder INT DEFAULT 0,
        IsActive BIT DEFAULT 1,
        CreatedBy INT FOREIGN KEY REFERENCES Users(Id),
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        UpdatedAt DATETIME2
    );
    
    PRINT 'Questions table created';
END
GO

-- =============================================
-- 7. Checklists Table (Submitted Audits)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Checklists')
BEGIN
    CREATE TABLE Checklists (
        Id INT PRIMARY KEY IDENTITY(1,1),
        DocumentNumber NVARCHAR(50) NOT NULL UNIQUE,
        StoreId INT FOREIGN KEY REFERENCES Stores(Id),
        AuditDate DATE NOT NULL,
        SubmittedBy INT FOREIGN KEY REFERENCES Users(Id),
        TotalCoefficient DECIMAL(10,2) DEFAULT 0,
        TotalEarned DECIMAL(10,2) DEFAULT 0,
        ScorePercentage DECIMAL(5,2) DEFAULT 0,
        Status NVARCHAR(20) DEFAULT 'Submitted',
        Notes NVARCHAR(MAX),
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        UpdatedAt DATETIME2
    );
    
    CREATE INDEX IX_Checklists_StoreId ON Checklists(StoreId);
    CREATE INDEX IX_Checklists_SubmittedBy ON Checklists(SubmittedBy);
    CREATE INDEX IX_Checklists_AuditDate ON Checklists(AuditDate);
    CREATE INDEX IX_Checklists_DocumentNumber ON Checklists(DocumentNumber);
    
    PRINT 'Checklists table created';
END
GO

-- =============================================
-- 8. Checklist Answers Table
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ChecklistAnswers')
BEGIN
    CREATE TABLE ChecklistAnswers (
        Id INT PRIMARY KEY IDENTITY(1,1),
        ChecklistId INT FOREIGN KEY REFERENCES Checklists(Id) ON DELETE CASCADE,
        QuestionId INT FOREIGN KEY REFERENCES Questions(Id),
        Answer NVARCHAR(10) NOT NULL, -- 'Yes', 'No', 'NA'
        Coefficient DECIMAL(5,2) NOT NULL,
        EarnedValue DECIMAL(5,2) NOT NULL,
        Comment NVARCHAR(500),
        CreatedAt DATETIME2 DEFAULT GETDATE()
    );
    
    CREATE INDEX IX_ChecklistAnswers_ChecklistId ON ChecklistAnswers(ChecklistId);
    
    PRINT 'ChecklistAnswers table created';
END
GO

-- =============================================
-- 9. Document Number Sequence
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DocumentSequence')
BEGIN
    CREATE TABLE DocumentSequence (
        Id INT PRIMARY KEY IDENTITY(1,1),
        Prefix NVARCHAR(20) NOT NULL UNIQUE,
        CurrentNumber INT DEFAULT 0,
        UpdatedAt DATETIME2 DEFAULT GETDATE()
    );
    
    INSERT INTO DocumentSequence (Prefix, CurrentNumber) VALUES ('GMRL-AMC', 0);
    
    PRINT 'DocumentSequence table created';
END
GO

-- =============================================
-- Helper Function: Get Next Document Number
-- =============================================
IF EXISTS (SELECT * FROM sys.objects WHERE name = 'GetNextDocumentNumber' AND type = 'P')
    DROP PROCEDURE GetNextDocumentNumber;
GO

CREATE PROCEDURE GetNextDocumentNumber
    @Prefix NVARCHAR(20),
    @DocumentNumber NVARCHAR(50) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @NextNumber INT;
    
    UPDATE DocumentSequence 
    SET CurrentNumber = CurrentNumber + 1, UpdatedAt = GETDATE()
    WHERE Prefix = @Prefix;
    
    SELECT @NextNumber = CurrentNumber FROM DocumentSequence WHERE Prefix = @Prefix;
    
    SET @DocumentNumber = @Prefix + '-' + RIGHT('0000' + CAST(@NextNumber AS NVARCHAR(10)), 4);
END
GO

PRINT '';
PRINT '=============================================';
PRINT '  Database Setup Complete!';
PRINT '=============================================';
PRINT '';
